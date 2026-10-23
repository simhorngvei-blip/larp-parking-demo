package com.larp.parking;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;

/** A UI boundary for this debug wrapper; server authentication is still required. */
public final class NavigationPolicy {
    private NavigationPolicy() {}
    public static boolean allows(String value) { return allows(value,"user"); }
    public static boolean allows(String value,String role) {
        if (!"user".equals(role) && !"guard".equals(role)) return false;
        try {
            URI uri = new URI(value);
            if (!"http".equals(uri.getScheme()) || !"127.0.0.1".equals(uri.getHost()) || uri.getPort()!=8080
                    || uri.getUserInfo()!=null || uri.getFragment()!=null || !("guard".equals(role)?"/guard":"/app").equals(uri.getRawPath())) return false;
            Set<String> seen = new HashSet<>();
            String query = uri.getRawQuery();
            if (query!=null) for (String pair : query.split("&")) {
                String[] parts = pair.split("=",2);
                String key = URLDecoder.decode(parts[0],StandardCharsets.UTF_8.name());
                String val = parts.length==2 ? URLDecoder.decode(parts[1],StandardCharsets.UTF_8.name()) : "";
                if (!seen.add(key)) return false;
                if ("native".equals(key)) { if (!role.equals(val)) return false; }
                else if ("identity".equals(key)) { if (!val.matches("[A-Za-z0-9-]{1,100}")) return false; }
                else return false;
            }
            return true;
        } catch (Exception error) { return false; }
    }
}
