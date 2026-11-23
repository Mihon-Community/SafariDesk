import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { useAuth } from "@/store/auth";
import { Layout } from "@/components/Layout";

import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Bookings from "@/pages/Bookings";
import NewBooking from "@/pages/NewBooking";
import BookingDetail from "@/pages/BookingDetail";
import Dispatch from "@/pages/Dispatch";
import Payments from "@/pages/Payments";
import Alerts from "@/pages/Alerts";
import Rates from "@/pages/Rates";
import Feedback from "@/pages/Feedback";

function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuth((s) => s.token);
  const location = useLocation();
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const token = useAuth((s) => s.token);
  if (token) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfAuthed>
            <Login />
          </RedirectIfAuthed>
        }
      />

      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="bookings" element={<Bookings />} />
        <Route path="bookings/new" element={<NewBooking />} />
        <Route path="bookings/:id" element={<BookingDetail />} />
        <Route path="dispatch" element={<Dispatch />} />
        <Route path="payments" element={<Payments />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="rates" element={<Rates />} />
        <Route path="feedback" element={<Feedback />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
