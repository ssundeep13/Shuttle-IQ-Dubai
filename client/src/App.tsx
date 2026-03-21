import { Switch, Route, Redirect } from "wouter";
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
import Dashboard from "@/pages/marketplace/Dashboard";
import Checkout from "@/pages/marketplace/Checkout";
import CheckoutSuccess from "@/pages/marketplace/CheckoutSuccess";
import CheckoutCancel from "@/pages/marketplace/CheckoutCancel";
import PlayerPublicProfile from "@/pages/marketplace/PlayerPublicProfile";
import ResetPassword from "@/pages/marketplace/ResetPassword";
import GuestCancel from "@/pages/marketplace/GuestCancel";
import GameHistory from "@/pages/marketplace/GameHistory";
import JoinTheCrew from "@/pages/marketplace/JoinTheCrew";
import ScoringGuide from "@/pages/marketplace/ScoringGuide";

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
      <Route path="/admin/login" component={Login} />
      <Route path="/login"><Redirect to="/marketplace/login" /></Route>
      <Route path="/session/:id" component={Home}/>
      <Route path="/player/:id" component={PlayerProfile}/>
      <Route path="/players" component={PlayerRegistry} />
      <Route path="/admin/players"><Redirect to="/admin/sessions" /></Route>
      <Route path="/admin/sessions">
        <ProtectedRoute>
          <SessionsManagement />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/marketplace"><Redirect to="/admin" /></Route>
      <Route path="/admin"><Redirect to="/admin/sessions" /></Route>

      <Route path="/marketplace">
        <MarketplaceRoute component={MarketplaceHome} />
      </Route>
      <Route path="/marketplace/login">
        <MarketplaceRoute component={MarketplaceLogin} />
      </Route>
      <Route path="/marketplace/signup">
        <MarketplaceRoute component={MarketplaceSignup} />
      </Route>
      <Route path="/marketplace/reset-password">
        <MarketplaceRoute component={ResetPassword} />
      </Route>
      <Route path="/marketplace/book">
        <MarketplaceRoute component={BookSessions} />
      </Route>
      <Route path="/marketplace/sessions/:id">
        <MarketplaceRoute component={SessionDetails} />
      </Route>
      <Route path="/marketplace/dashboard">
        <MarketplaceAuthRoute component={Dashboard} />
      </Route>
      <Route path="/marketplace/rankings">
        <MarketplaceRoute component={Rankings} />
      </Route>
      <Route path="/marketplace/checkout/success" component={CheckoutSuccess} />
      <Route path="/marketplace/checkout/cancel" component={CheckoutCancel} />
      <Route path="/marketplace/checkout/:id">
        <MarketplaceRoute component={Checkout} />
      </Route>
      <Route path="/marketplace/guest-cancel">
        <MarketplaceRoute component={GuestCancel} />
      </Route>
      <Route path="/marketplace/guests/cancel/:token">
        <MarketplaceRoute component={GuestCancel} />
      </Route>

      <Route path="/marketplace/my-bookings">
        <MarketplaceAuthRoute component={MyBookings} />
      </Route>
      <Route path="/marketplace/my-scores">
        <MarketplaceAuthRoute component={MyScores} />
      </Route>
      <Route path="/marketplace/game-history">
        <MarketplaceAuthRoute component={GameHistory} />
      </Route>
      <Route path="/marketplace/profile">
        <MarketplaceAuthRoute component={Profile} />
      </Route>
      <Route path="/marketplace/players/:playerId">
        <MarketplaceRoute component={PlayerPublicProfile} />
      </Route>
      <Route path="/marketplace/join-the-crew">
        <MarketplaceRoute component={JoinTheCrew} />
      </Route>
      <Route path="/marketplace/scoring-guide">
        <MarketplaceRoute component={ScoringGuide} />
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
