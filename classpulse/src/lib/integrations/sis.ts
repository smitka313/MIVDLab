/**
 * Student Information System (SIS) integration boundary.
 *
 * ClassPulse does NOT currently synchronize with any SIS. Rosters come in by CSV
 * (PowerSchool and Schoology exports are recognized; see features/students/import-logic.ts). This interface defines
 * the shape a future, district-approved connector (e.g. PowerSchool's OneRoster 1.2 API or a
 * PowerSchool plugin with OAuth client credentials) must implement. Any connector must run server-side with its own
 * credentials and be reviewed under the district's data-privacy agreements.
 */

export interface SisRosterStudent {
  sourcedId: string;
  givenName: string;
  familyName: string;
  preferredName?: string;
  grade?: number;
}

export interface SisSection {
  sourcedId: string;
  title: string;
  period?: string;
}

export interface SisAttendanceExport {
  sectionSourcedId: string;
  studentSourcedId: string;
  date: string;
  status: "present" | "absent" | "tardy" | "excused";
}

export interface SisConnector {
  readonly id: string;
  readonly displayName: string;
  /** True only when credentials are configured AND a connection test has passed. */
  isConfigured(): Promise<boolean>;
  listSections(): Promise<SisSection[]>;
  listRoster(sectionId: string): Promise<SisRosterStudent[]>;
  /** Optional: push classroom attendance. Must never run without explicit teacher action. */
  exportAttendance?(records: SisAttendanceExport[]): Promise<{ accepted: number; rejected: number }>;
}

/** Registered connectors. Empty: no SIS integration is implemented yet. */
export const SIS_CONNECTORS: SisConnector[] = [];

export function sisStatus(): { connected: false; message: string } {
  return {
    connected: false,
    message: "Not connected. ClassPulse attendance is a classroom record only and is not sent to your school's official attendance system.",
  };
}
