import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';

export function RootRedirect() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        // Redirect authenticated users to Sessions Management (main hub)
        navigate('/admin/sessions', { replace: true });
      } else {
        // Redirect unauthenticated users to Login
        navigate('/login', { replace: true });
      }
    }
  }, [user, isLoading, navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-muted-foreground">Loading...</p>
    </div>
  );
}
