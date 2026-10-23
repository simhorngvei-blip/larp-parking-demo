// Adapted composition from Tailark dusk hero-section/one (MIT).
// Next.js navigation/image dependencies replaced with local, accessible React content.
import {ArrowRight,Play,ScanLine} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {BlurFade} from '@/components/magicui/blur-fade'
export default function TailarkHero(){return <section className="s-hero" aria-labelledby="saas-title">
 <BlurFade><a href="#tour" className="s-announcement"><ScanLine size={15}/><span>Parking access. A connected experience.</span><ArrowRight size={14}/></a></BlurFade>
 <BlurFade delay={.08}><h1 id="saas-title">Every arrival.<br/><span>A better experience.</span></h1></BlurFade>
 <BlurFade delay={.16}><p className="s-lead">A space for every driver. A clear view for every property.<br className="s-desktop-break"/> Bring parking access, visitors and EV charging together.</p></BlurFade>
 <BlurFade delay={.2}><div className="s-actions"><Button asChild size="lg"><a href="#tour">Explore the platform <ArrowRight/></a></Button><Button asChild variant="outline" size="lg"><a href="#pilot"><Play/>Plan a property pilot</a></Button></div></BlurFade>
 <p className="s-caption">License-plate Automated Recognition Parking <span>·</span> University Hackathon 2026</p>
 </section>}
