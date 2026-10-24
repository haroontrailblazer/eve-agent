"use client";

import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmActionButton } from "@/components/harpy/confirm-action-button";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { ChatListItem } from "@/lib/chat/types";

// "Recent chats" in the sidebar on chat routes: a + that opens a new chat, one
// row per chat with a confirmed delete, and a sentinel that loads the next
// page when it scrolls into view.
export function ChatHistoryGroup({
  activeChatId,
  chats,
  hasMoreChats,
  isLoadingChats,
  isLoadingMore,
  onDeleteChat,
  onLoadMoreChats,
  onNewChat,
  onSelectChat,
}: {
  readonly activeChatId: string | null;
  readonly chats: readonly ChatListItem[];
  readonly hasMoreChats: boolean;
  readonly isLoadingChats: boolean;
  readonly isLoadingMore: boolean;
  readonly onDeleteChat: (chatId: string) => Promise<void>;
  // Resolves false when the page could not be loaded.
  readonly onLoadMoreChats: () => Promise<boolean>;
  readonly onNewChat: () => void;
  readonly onSelectChat: (chatId: string) => void;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // After a failed load the sentinel stops loading by itself, so a lost
  // connection does not retry in a loop; "Load more" turns it back on.
  const [autoLoad, setAutoLoad] = useState(true);

  const loadMore = useCallback(async () => {
    setAutoLoad(await onLoadMoreChats());
  }, [onLoadMoreChats]);

  // Observes again after every page, so a sentinel that is still in view
  // keeps loading until the list fills the sidebar.
  useEffect(() => {
    const sentinel = sentinelRef.current;

    if (!sentinel || !hasMoreChats || isLoadingMore || !autoLoad) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          observer.disconnect();
          void loadMore();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [autoLoad, hasMoreChats, isLoadingMore, loadMore]);

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Recent chats</SidebarGroupLabel>
      <SidebarGroupAction asChild>
        <Link href="/chat" onClick={onNewChat} title="New chat">
          <PlusIcon />
          <span className="sr-only">New chat</span>
        </Link>
      </SidebarGroupAction>
      <SidebarGroupContent>
        <SidebarMenu>
          {chats.map((chat) => (
            <SidebarMenuItem key={chat.id}>
              {/* Room on the right for the delete button. */}
              <SidebarMenuButton
                asChild
                className="group-has-data-[sidebar=menu-action]/menu-item:pr-16"
                isActive={chat.id === activeChatId}
              >
                <Link
                  aria-current={chat.id === activeChatId ? "page" : undefined}
                  href={`/chat/${chat.id}`}
                  onClick={() => onSelectChat(chat.id)}
                >
                  <span>{chat.title}</span>
                </Link>
              </SidebarMenuButton>
              {/* ConfirmActionButton renders its own trigger button, so the
                  action is a wrapper that positions it, shows it on hover, and
                  quiets the trigger to a small text button: on touch screens
                  every row shows it. The dialog keeps the destructive confirm. */}
              <SidebarMenuAction
                asChild
                className="aspect-auto w-auto after:hidden peer-data-[size=default]/menu-button:top-1 [&>button]:h-6 [&>button]:bg-transparent [&>button]:px-2 [&>button]:text-xs [&>button]:font-normal [&>button]:text-sidebar-foreground/70 [&>button]:hover:bg-sidebar-accent [&>button]:hover:text-destructive"
                showOnHover
              >
                <div>
                  <ConfirmActionButton
                    confirmBody={`This removes "${chat.title}" for good.`}
                    confirmLabel="Delete chat"
                    confirmTitle="Delete this chat?"
                    label="Delete"
                    onConfirm={() => onDeleteChat(chat.id)}
                    pendingLabel="Deleting..."
                  />
                </div>
              </SidebarMenuAction>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        {!isLoadingChats && chats.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-sidebar-foreground/70">No chats yet.</p>
        ) : null}
        {hasMoreChats ? (
          <div className="px-2 py-2" ref={sentinelRef}>
            {isLoadingMore ? (
              <p className="text-xs text-sidebar-foreground/70">Loading more...</p>
            ) : (
              <button
                className="text-xs text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground"
                onClick={() => void loadMore()}
                type="button"
              >
                Load more
              </button>
            )}
          </div>
        ) : null}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
