"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, KeyRound, MoreVertical, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { ROLES, type Permission, type Role } from "@/lib/permissions";
import { useAuth } from "@/store/auth";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { DataTable } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/PageHeader";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "invited" | "pending" | "disabled";
  requestedRole?: Role | null;
  lastLoginAt: string | null;
  createdAt: string;
}

const helper = createColumnHelper<AdminUser>();
const STAFF_ROLES: Role[] = ["operations", "dispatcher", "finance", "agent", "driver", "customer"];

/** Admin /users table: role changes, activation, password resets, invites. */
export function UsersAdmin({ users }: { users: AdminUser[] }) {
  const currentUser = useAuth((s) => s.user);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("operations");
  const [busyId, setBusyId] = useState<string | null>(null);
  const qc = useQueryClient();
  const pendingQuery = useQuery({
    queryKey: ["users", "pending"],
    queryFn: () => api<{ users: AdminUser[] }>("/api/users/pending"),
  });

  async function decide(id: string, action: "approve" | "reject") {
    setBusyId(id);
    try {
      await api(`/api/users/${id}/${action}`, { method: "POST", body: {} });
      toast.success(action === "approve" ? "Access granted" : "Request rejected");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["users", "pending"] }),
        qc.invalidateQueries({ queryKey: ["users"] }),
      ]);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function patch(id: string, body: { role?: Role; status?: AdminUser["status"] }, label: string) {
    setBusyId(id);
    try {
      await api(`/api/users/${id}`, { method: "PATCH", body });
      toast.success(label);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function sendReset(id: string) {
    setBusyId(id);
    try {
      await api(`/api/users/${id}/password-reset`, { method: "POST" });
      toast.success("Reset link sent");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not send the reset link");
    } finally {
      setBusyId(null);
    }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await api<{ ok: boolean; devToken?: string }>("/api/auth/invite", {
        method: "POST",
        body: { email: inviteEmail, role: inviteRole },
      });
      toast.success("Invite sent");
      if (res.devToken) toast.info(`Dev invite token: ${res.devToken}`);
      setInviteEmail("");
      setInviteOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create the invite");
    }
  }

  const columns = useMemo<Array<ColumnDef<AdminUser, any>>>(
    () => [
      helper.accessor((row) => `${row.name}|${row.email}`, {
        id: "user",
        header: "User",
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.name}</p>
            <p className="text-xs text-muted-foreground">{row.original.email}</p>
          </div>
        ),
      }),
      helper.accessor("role", {
        header: "Role",
        cell: ({ row }) => {
          const user = row.original;
          const isSelf = user.id === currentUser?.id;
          return (
            <select
              value={user.role}
              disabled={isSelf || busyId === user.id}
              onChange={(e) =>
                void patch(user.id, { role: e.target.value as Role }, `${user.name} is now ${e.target.value}`)
              }
              className="h-8 rounded border bg-transparent px-2 text-xs disabled:opacity-60"
              aria-label={`Role for ${user.name}`}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role.replace("_", " ")}
                </option>
              ))}
            </select>
          );
        },
      }),
      helper.accessor("status", {
        header: "Status",
        cell: ({ getValue }) => {
          const status = getValue();
          return (
            <Badge
              variant={
                status === "active" ? "secondary" : status === "disabled" ? "destructive" : "outline"
              }
              className="text-[10px]"
            >
              {status}
            </Badge>
          );
        },
      }),
      helper.accessor("lastLoginAt", {
        header: "Last sign-in",
        cell: ({ getValue }) => {
          const value = getValue();
          return <span className="text-xs text-muted-foreground">{value ? formatDateTime(value) : "Never"}</span>;
        },
      }),
      helper.display({
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const user = row.original;
          const isSelf = user.id === currentUser?.id;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${user.name}`}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {!isSelf && (
                  <DropdownMenuItem
                    onSelect={() =>
                      void patch(
                        user.id,
                        { status: user.status === "disabled" ? "active" : "disabled" },
                        user.status === "disabled" ? `${user.name} reactivated` : `${user.name} deactivated`,
                      )
                    }
                  >
                    {user.status === "disabled" ? "Reactivate" : "Deactivate"}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => void sendReset(user.id)}>
                  <KeyRound className="h-4 w-4" /> Send password reset
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      }),
    ],
    [busyId, currentUser?.id],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users & roles"
        description="Invite staff, assign roles, deactivate accounts and send password resets. Every change is audit-logged."
        actions={
          <Button onClick={() => setInviteOpen((v) => !v)} className="gap-1.5">
            <UserPlus className="h-4 w-4" /> Invite staff
          </Button>
        }
      />

      {pendingQuery.data && pendingQuery.data.users.length > 0 && (
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <p className="text-sm font-medium">
            Pending requests ({pendingQuery.data.users.length})
          </p>
          <ul className="divide-y">
            {pendingQuery.data.users.map((user) => (
              <li key={user.id} className="flex flex-wrap items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
                <Badge>{user.requestedRole ?? "pending"}</Badge>
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={() => void decide(user.id, "approve")} disabled={busyId === user.id}>
                    <Check className="h-3.5 w-3.5" aria-hidden /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void decide(user.id, "reject")}
                    disabled={busyId === user.id}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden /> Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {inviteOpen && (
        <form onSubmit={sendInvite} className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="driver@safaridesk.app"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <select
              id="invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm sm:w-44"
            >
              {STAFF_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button type="submit">Send invite</Button>
            <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      <DataTable
        data={users}
        columns={columns}
        tableId="users"
        searchPlaceholder="Search users…"
        exportName="users"
        pageSizeOptions={[10, 25, 50]}
        emptyState={
          <p className="py-6 text-center text-sm text-muted-foreground">No users yet.</p>
        }
      />
    </div>
  );
}
