/**
 * One shape per kind of thing, no matter which connector produced it.
 * Outlook mail and Gmail arrive as the same MailItem; Outlook calendar
 * and Google Calendar arrive as the same CalendarItem. The `source`
 * field keeps provenance visible on screen so Brad always knows which
 * account something came from.
 *
 * Client-safe: no server-only imports here.
 */

export interface MailItem {
  id: string;
  source: "outlook" | "gmail";
  subject: string;
  from: string;
  fromEmail: string;
  /** ISO time the message arrived. */
  receivedAt: string;
  snippet: string;
  /** Deep link that opens the message in its own app. */
  url: string;
  unread: boolean;
  flagged: boolean;
  hasAttachments: boolean;
  /** Why the dashboard is showing it: flagged, unread priority, or waiting. */
  reason: "flagged" | "priority" | "waiting" | "keyword";
  /** Whole hours since it arrived, for the "waiting on you" read. */
  ageHours: number;
}

export interface CalendarItem {
  id: string;
  source: "outlook" | "google";
  title: string;
  /** ISO dateTime, or YYYY-MM-DD when allDay. */
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  organizer: string;
  attendeeCount: number;
  /** True when it is a real meeting with other people, inside the next 24h. */
  needsPrep: boolean;
  url: string;
  joinUrl: string;
}

export interface ChatItem {
  id: string;
  source: string;
  channel: string;
  from: string;
  text: string;
  receivedAt: string;
  url: string;
  isDirect: boolean;
  isMention: boolean;
}
