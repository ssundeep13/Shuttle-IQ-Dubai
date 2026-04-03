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
import { MarketplaceLayout } from "@/pages/marketplace/MarketplaceLayout";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

// Lazy-load every page so Vite creates separate JS chunks per route.
// Only the chunk for the page the user visits is downloaded — not the whole app.
const Home = lazy(() => import("@/pages/Home"));
const NotFound = lazy(() => import("@/pages/not-found"));
const Login = lazy(() => import("@/pages/Login"));
const SessionsManagement = lazy(() => import("@/pages/SessionsManagement"));
const PlayerProfile = lazy(() => import("@/pages/PlayerProfile"));
const PlayerRegistry = lazy(() => import("@/pages/PlayerRegistry"));
const MarketplaceHome = lazy(() => import("@/pages/marketplace/MarketplaceHome"));
const MarketplaceLogin = lazy(() => import("@/pages/marketplace/MarketplaceLogin"));
const MarketplaceSignup = lazy(() => import("@/pages/marketplace/MarketplaceSignup"));
const BookSessions = lazy(() => import("@/pages/marketplace/BookSessions"));
const SessionDetails = lazy(() => import("@/pages/marketplace/SessionDetails"));
const MyBookings = lazy(() => import("@/pages/marketplace/MyBookings"));
const MyScores = lazy(() => import("@/pages/marketplace/MyScores"));
const Rankings = lazy(() => import("@/pages/marketplace/Rankings"));
const Profile = lazy(() => import("@/pages/marketplace/Profile"));
const Dashboard = lazy(() => import("@/pages/marketplace/Dashboard"));
const Checkout = lazy(() => import("@/pages/marketplace/Checkout"));
const CheckoutSuccess = lazy(() => import("@/pages/marketplace/CheckoutSuccess"));
const CheckoutCancel = lazy(() => import("@/pages/marketplace/CheckoutCancel"));
const PlayerPublicProfile = lazy(() => import("@/pages/marketplace/PlayerPublicProfile"));
const ResetPassword = lazy(() => import("@/pages/marketplace/ResetPassword"));
const GuestCancel = lazy(() => import("@/pages/marketplace/GuestCancel"));
const GameHistory = lazy(() => import("@/pages/marketplace/GameHistory"));
const JoinTheCrew = lazy(() => import("@/pages/marketplace/JoinTheCrew"));
const ScoringGuide = lazy(() => import("@/pages/marketplace/ScoringGuide"));
const GoogleAuthCallback = lazy(() => import("@/pages/marketplace/GoogleAuthCallback"));
const InstagramCarousel = lazy(() => import("@/pages/InstagramCarousel"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );
}

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
    <Suspense fallback={<PageLoader />}>
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
        <Route path="/marketplace/auth/callback">
          <MarketplaceRoute component={GoogleAuthCallback} />
        </Route>

        <Route path="/carousel" component={InstagramCarousel} />

        <Route component={NotFound} />
      </Switch>
    </Suspense>
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
