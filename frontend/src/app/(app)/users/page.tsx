"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";

/** Placeholder until Phase 8 wires RBAC and the /users admin table. */
export default function UsersPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Users & roles"
        description="Invite staff, assign roles and deactivate accounts."
      />
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">Coming in Phase 8</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2 text-sm text-muted-foreground">
          User management (invite, role changes, deactivation) arrives with the
          auth and RBAC phase. Meanwhile, admin accounts are seeded by the backend.
        </CardContent>
      </Card>
    </div>
  );
}
