/**
 * Health Vibe AI - Scheduling & Telehealth Ambient Type Declarations
 * Ensures type-safety for complex state transitions, concurrency windows, and WebRTC sessions.
 */

export type AppointmentStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'rescheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type TelehealthRoomState =
  | 'created'
  | 'waiting'
  | 'active'
  | 'disconnected'
  | 'ended';

export interface AppointmentSlot {
  slotId: string;
  doctorId: string;
  clinicId: string;
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
  isBooked: boolean;
  bookedByPatientId?: string | null;
  appointmentId?: string | null;
}

export interface AppointmentRecord {
  id: string;
  patientId: string;
  doctorId: string;
  clinicId: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  consultationType: 'in_person' | 'telehealth_video';
  telehealthRoomId?: string | null;
  paymentStatus: 'unpaid' | 'paid' | 'refunded';
  notes?: string;
  cancellationReason?: string;
  cancelledBy?: string;
  rescheduledFromId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WaitingListEntry {
  id: string;
  patientId: string;
  doctorId: string;
  clinicId: string;
  requestedDate: string;
  timeWindowPreference?: 'morning' | 'evening' | 'any';
  status: 'active' | 'offered' | 'expired' | 'fulfilled' | 'cancelled';
  offerExpiresAt?: string;
  joinedAt: string;
}

export interface TelehealthParticipantToken {
  token: string;
  roomId: string;
  participantId: string;
  role: 'doctor' | 'patient';
  e2ee: boolean;
  recording: boolean;
  expiresAt: string;
}

export interface TelehealthRoom {
  roomId: string;
  appointmentId: string;
  doctorId: string;
  patientId: string;
  state: TelehealthRoomState;
  provider: 'daily' | 'livekit' | 'sandbox';
  e2eeEnabled: boolean;
  recordingEnabled: boolean; // Default must be false
  accessWindowStart: string; // Slot start minus 15m early buffer
  accessWindowEnd: string;   // Slot end plus 45m grace buffer
  participants: Map<string, { role: string; connectedAt: string; ip: string }>;
  createdAt: string;
  updatedAt: string;
}
