-- Private, synthetic demo transport. No browser role can read or execute these objects.
create table public.larp_cloud_runtime (
 slot text primary key, owner uuid, lease_until timestamptz not null default '-infinity',
 ready boolean not null default false, heartbeat_at timestamptz, status jsonb not null default '{}',
 checkpoint jsonb not null default '{}', revision bigint not null default 0
);
create table public.larp_cloud_jobs (
 id uuid primary key, slot text not null references public.larp_cloud_runtime(slot),
 request_key text not null unique, fingerprint text not null, target uuid not null,
 method text not null check(method in ('GET','POST')), path text not null, headers jsonb not null, body jsonb,
 state text not null default 'QUEUED' check(state in ('QUEUED','EXECUTING','DONE','UNKNOWN')),
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null,
 response jsonb, completed_at timestamptz
);
create index larp_cloud_pending on public.larp_cloud_jobs(slot,target,created_at) where state='QUEUED';
create index larp_cloud_cleanup on public.larp_cloud_jobs(created_at);
alter table public.larp_cloud_runtime enable row level security;
alter table public.larp_cloud_jobs enable row level security;
revoke all on public.larp_cloud_runtime,public.larp_cloud_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.larp_cloud_runtime,public.larp_cloud_jobs to service_role;

create function public.larp_cloud_heartbeat(p_slot text,p_owner uuid,p_ready boolean,p_status jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.larp_cloud_runtime;
begin
 insert into public.larp_cloud_runtime(slot) values(p_slot) on conflict do nothing;
 select * into r from public.larp_cloud_runtime where slot=p_slot for update;
 if r.owner is distinct from p_owner and r.lease_until>clock_timestamp() then return jsonb_build_object('acquired',false); end if;
 update public.larp_cloud_runtime set owner=p_owner,ready=p_ready,status=p_status,heartbeat_at=clock_timestamp(),lease_until=clock_timestamp()+interval '30 seconds' where slot=p_slot;
 return jsonb_build_object('acquired',true,'checkpoint',r.checkpoint,'revision',r.revision);
end $$;

create function public.larp_cloud_enqueue(p_slot text,p_id uuid,p_key text,p_fingerprint text,p_method text,p_path text,p_headers jsonb,p_body jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.larp_cloud_runtime; j public.larp_cloud_jobs;
begin
 select * into j from public.larp_cloud_jobs where request_key=p_key;
 if found then
  if j.fingerprint<>p_fingerprint then raise exception 'Idempotency conflict'; end if;
  return to_jsonb(j);
 end if;
 select * into r from public.larp_cloud_runtime where slot=p_slot for share;
 if not found or not r.ready or r.lease_until<=clock_timestamp() or r.heartbeat_at<clock_timestamp()-interval '15 seconds' then raise exception 'Cloud runtime offline or starting'; end if;
 insert into public.larp_cloud_jobs(id,slot,request_key,fingerprint,target,method,path,headers,body,expires_at)
 values(p_id,p_slot,p_key,p_fingerprint,r.owner,p_method,p_path,p_headers,p_body,clock_timestamp()+interval '25 seconds')
 on conflict(request_key) do nothing;
 select * into j from public.larp_cloud_jobs where request_key=p_key;
 if j.fingerprint<>p_fingerprint then raise exception 'Idempotency conflict'; end if;
 return to_jsonb(j);
end $$;

create function public.larp_cloud_take(p_slot text,p_owner uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.larp_cloud_jobs;
begin
 if not exists(select 1 from public.larp_cloud_runtime where slot=p_slot and owner=p_owner and lease_until>clock_timestamp()) then raise exception 'Lease lost'; end if;
 update public.larp_cloud_jobs set state='UNKNOWN' where slot=p_slot and state='QUEUED' and (expires_at<clock_timestamp() or target<>p_owner);
 select * into j from public.larp_cloud_jobs where slot=p_slot and target=p_owner and state='QUEUED' and expires_at>clock_timestamp() order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 update public.larp_cloud_jobs set state='EXECUTING' where id=j.id;
 return to_jsonb(j);
end $$;

create function public.larp_cloud_commit(p_slot text,p_owner uuid,p_job uuid,p_response jsonb,p_checkpoint jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.larp_cloud_runtime where slot=p_slot and owner=p_owner and lease_until>clock_timestamp() for update;
 if not found then raise exception 'Lease lost; outcome unconfirmed'; end if;
 if p_checkpoint is not null then update public.larp_cloud_runtime set checkpoint=p_checkpoint,revision=revision+1 where slot=p_slot; end if;
 if p_job is not null then
  update public.larp_cloud_jobs set state='DONE',response=p_response,completed_at=clock_timestamp() where id=p_job and target=p_owner and state='EXECUTING';
  if not found then raise exception 'Job not executing'; end if;
 end if;
 delete from public.larp_cloud_jobs where created_at<clock_timestamp()-interval '1 day';
end $$;

revoke all on function public.larp_cloud_heartbeat(text,uuid,boolean,jsonb),public.larp_cloud_enqueue(text,uuid,text,text,text,text,jsonb,jsonb),public.larp_cloud_take(text,uuid),public.larp_cloud_commit(text,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.larp_cloud_heartbeat(text,uuid,boolean,jsonb),public.larp_cloud_enqueue(text,uuid,text,text,text,text,jsonb,jsonb),public.larp_cloud_take(text,uuid),public.larp_cloud_commit(text,uuid,uuid,jsonb,jsonb) to service_role;
