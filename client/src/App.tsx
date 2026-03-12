import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { MarketplaceAuthProvider } from "@/contexts/MarketplaceAuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { MarketplaceProtectedRoute } from "@/components/MarketplaceProtectedRoute";
import { RootRedirect } from "@/components/RootRedirect";
import Home from "@/pages/Home";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import Admin from "@/pages/Admin";
import SessionsManagement from "@/pages/SessionsManagement";
import PlayerProfile from "@/pages/PlayerProfile";
import PlayerRegistry from "@/pages/PlayerRegistry";
import { MarketplaceLayout } from "@/pages/marketplace/MarketplaceLayout";
import MarketplaceHome from "@/pages/marketplace/MarketplaceHome";
import MarketplaceLogin from "@/pages/marketplace/MarketplaceLogin";
import MarketplaceSignup from "@/pages/marketplace/MarketplaceSignup";
import BookSessions from "@/pages/marketplace/BookSessions";
import SessionDetails from "@/pages/marketplace/SessionDetails";
import MyBookings from "@/pages/marketplace/MyBookings";
import MyScores from "@/pages/marketplace/MyScores";
import Rankings from "@/pages/marketplace/Rankings";
import Profile from "@/pages/marketplace/Profile";
import AdminMarketplace from "@/pages/marketplace/AdminMarketplace";
import CheckoutSuccess from "@/pages/marketplace/CheckoutSuccess";
import CheckoutCancel from "@/pages/marketplace/CheckoutCancel";

function MarketplaceRoute({ component: Component, ...rest }: { component: React.ComponentType<any> } & Record<string, any>) {
  return (
    <MarketplaceLayout>
      <Component {...rest} />
    </MarketplaceLayout>
  );
}

function MarketplaceAuthRoute({ component: Component }: { component: React.ComponentType<any> }) {
  return (
    <MarketplaceLayout>
      <MarketplaceProtectedRoute>
        <Component />
      </MarketplaceProtectedRoute>
    </MarketplaceLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RootRedirect}/>
      <Route path="/login" component={Login} />
      <Route path="/session/:id" component={Home}/>
      <Route path="/player/:id" component={PlayerProfile}/>
      <Route path="/players" component={PlayerRegistry} />
      <Route path="/admin/players">
        <ProtectedRoute>
          <PlayerRegistry />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/sessions">
        <ProtectedRoute>
          <SessionsManagement />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/marketplace">
        <ProtectedRoute>
          <MarketplaceLayout>
            <AdminMarketplace />
          </MarketplaceLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin">
        <ProtectedRoute>
          <Admin />
        </ProtectedRoute>
      </Route>

      <Route path="/marketplace">
        <MarketplaceRoute component={MarketplaceHome} />
      </Route>
      <Route path="/marketplace/login">
        <MarketplaceRoute component={MarketplaceLogin} />
      </Route>
      <Route path="/marketplace/signup">
        <MarketplaceRoute component={MarketplaceSignup} />
      </Route>
      <Route path="/marketplace/book">
        <MarketplaceRoute component={BookSessions} />
      </Route>
      <Route path="/marketplace/sessions/:id">
        <MarketplaceRoute component={SessionDetails} />
      </Route>
      <Route path="/marketplace/rankings">
        <MarketplaceRoute component={Rankings} />
      </Route>
      <Route path="/marketplace/checkout/success">
        <MarketplaceRoute component={CheckoutSuccess} />
      </Route>
      <Route path="/marketplace/checkout/cancel">
        <MarketplaceRoute component={CheckoutCancel} />
      </Route>

      <Route path="/marketplace/my-bookings">
        <MarketplaceAuthRoute component={MyBookings} />
      </Route>
      <Route path="/marketplace/my-scores">
        <MarketplaceAuthRoute component={MyScores} />
      </Route>
      <Route path="/marketplace/profile">
        <MarketplaceAuthRoute component={Profile} />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MarketplaceAuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </MarketplaceAuthProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
