"use client";

import { ChevronsUpDownIcon, LogOutIcon, RadioTowerIcon, SettingsIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { showRequestError } from "@/components/harpy/show-request-error";
import { HarpyMarkIcon } from "@/components/icons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import type { Viewer } from "@/lib/chat/types";

// The signed-in account in the sidebar footer, with links to Settings and
// Channels and a sign-out action.
export function UserMenu({
  onNavigate,
  viewer,
}: {
  readonly onNavigate?: () => void;
  readonly viewer: Viewer;
}) {
  const { isMobile } = useSidebar();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    if (signingOut) {
      return;
    }

    setSigningOut(true);
    const toastId = toast.loading("Signing out...");

    try {
      const result = await authClient.signOut();

      if (result.error) {
        throw new Error(result.error.message ?? "Could not sign out.");
      }

      toast.dismiss(toastId);
      onNavigate?.();
      router.replace("/");
      router.refresh();
    } catch (error) {
      toast.dismiss(toastId);
      showRequestError(error instanceof Error ? error.message : "Could not sign out.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              size="lg"
            >
              <UserAvatar viewer={viewer} />
              <span className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate text-xs font-medium">{viewer.name}</span>
                <span className="truncate text-meta text-muted-foreground">{viewer.email}</span>
              </span>
              <ChevronsUpDownIcon className="ml-auto size-4 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-56"
            side={isMobile ? "top" : "right"}
            sideOffset={6}
          >
            <DropdownMenuItem asChild>
              <Link href="/settings" onClick={onNavigate}>
                <SettingsIcon />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/channels" onClick={onNavigate}>
                <RadioTowerIcon />
                Channels
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={signingOut}
              onSelect={() => {
                void signOut();
              }}
            >
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function UserAvatar({ viewer }: { readonly viewer: Viewer }) {
  return (
    <Avatar className="size-8 rounded-md border border-sidebar-border">
      {viewer.image ? <AvatarImage alt="" src={viewer.image} /> : null}
      <AvatarFallback className="rounded-md bg-background">
        <HarpyMarkIcon className="size-4 text-muted-foreground" />
      </AvatarFallback>
    </Avatar>
  );
}
