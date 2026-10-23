import java.lang.reflect.Method;

public class NavigationPolicyTest {
    public static void main(String[] args) throws Exception {
        Class<?> policy;
        try { policy = Class.forName("com.larp.parking.NavigationPolicy"); }
        catch (ClassNotFoundException error) { throw new AssertionError("Android user navigation policy has not been implemented", error); }
        Method allows = policy.getMethod("allows", String.class);
        String[] valid = {"http://127.0.0.1:8080/app?native=user", "http://127.0.0.1:8080/app?identity=resident-alicia&native=user"};
        String[] invalid = {"https://evil.example/app", "http://127.0.0.1:8080/developer", "http://127.0.0.1:8080/security", "http://127.0.0.1:8080/?view=three", "file:///sdcard/test.html", "javascript:alert(1)", "http://127.0.0.1:8080/app?app=developer", "http://127.0.0.1:8080/app?view=overview", "http://127.0.0.1:8080/app?%61pp=security", "http://127.0.0.1:8080/app?native=user&native=anything", "http://127.0.0.1:8081/app", "http://evil@127.0.0.1:8080/app", "http://127.0.0.1.evil:8080/app", "http://127.0.0.1:8080/app/../developer", "not a URI", "http://127.0.0.1:8080/app#developer"};
        for (String url : valid) if (!(boolean)allows.invoke(null,url)) throw new AssertionError("User route rejected: " + url);
        for (String url : invalid) if ((boolean)allows.invoke(null,url)) throw new AssertionError("Unsafe or engineering route allowed: " + url);
        Method roleAllows = policy.getMethod("allows",String.class,String.class);
        if (!(boolean)roleAllows.invoke(null,"http://127.0.0.1:8080/guard?native=guard","guard")) throw new AssertionError("Guard package rejected own route");
        for (String url : new String[]{"http://127.0.0.1:8080/app?native=user","http://127.0.0.1:8080/server-room","http://127.0.0.1:8080/developer","http://127.0.0.1:8080/guard?native=user"})
            if ((boolean)roleAllows.invoke(null,url,"guard")) throw new AssertionError("Guard package leaked another interface: "+url);
        System.out.println("PASS Android navigation: " + (valid.length+invalid.length+5) + " allowed/blocked route cases");
    }
}
