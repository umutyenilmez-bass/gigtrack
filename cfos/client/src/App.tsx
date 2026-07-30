import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Auth from "./pages/Auth";
import { useEffect } from "react";

function Router() {
  const [location, setLocation] = useLocation();
  const token = localStorage.getItem("token");

  useEffect(() => {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    if (isLocalhost) {
      if (!token) {
        localStorage.setItem("token", "local_bypass_jwt_token");
        localStorage.setItem("username", "local_user");
        window.location.reload();
      }
    } else {
      if (!token && location !== "/auth") {
        setLocation("/auth");
      }
    }
  }, [token, location, setLocation]);

  return (
    <Switch>
      <Route path="/auth" component={Auth} />
      <Route path="/" component={Home} />
      <Route path="/404" component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
