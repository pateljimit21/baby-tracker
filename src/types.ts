// All amounts are stored in metric (ml, kg, cm, °C) and converted for display.
// All times are milliseconds since 1970 (Date.now()).

export interface AppUser {
  uid: string
  name: string
  email: string
}

export interface Member {
  name: string
  /** Invite code used to join; absent for the family's creator. */
  via?: string
}

export interface Family {
  id: string
  name: string
  memberIds: string[]
  members: Record<string, Member>
  inviteCode: string
  createdBy: string
}

export interface Baby {
  id: string
  name: string
  birthDate: number
  /** Picks the app's colors: blue for a boy, pink for a girl, teal when not set. */
  sex?: 'boy' | 'girl'
}

/** Frequent day-to-day logs. Queried by time range. */
export type EntryType = 'bottle' | 'breast' | 'solid' | 'pump' | 'diaper' | 'sleep' | 'med' | 'temp'

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface Entry {
  id: string
  type: EntryType
  /** When it happened, or when it started for timed entries. */
  time: number
  /** For breast and sleep: when it ended. null = timer still running. */
  endTime?: number | null

  // bottle. amountMl is the whole bottle; for 'mixed', breastMilkMl is the breast milk part
  // and the rest is formula.
  amountMl?: number
  milk?: 'formula' | 'breastmilk' | 'mixed'
  breastMilkMl?: number

  // breast (timer). Seconds already counted per side, plus the side running now.
  leftSec?: number
  rightSec?: number
  activeSide?: 'L' | 'R' | null
  activeSince?: number | null

  // solid food
  food?: string
  meal?: Meal

  // pump
  leftMl?: number
  rightMl?: number

  // diaper
  diaper?: 'wet' | 'dirty' | 'both'

  // med
  medName?: string
  dose?: string

  // temp
  tempC?: number

  note?: string
  by: string
  byName: string
  updatedAt: number
}

/** Long-lived records. Few of them, so they're always loaded in full. */
export type RecordType = 'visit' | 'vaccine' | 'growth' | 'question'

export interface HealthRecord {
  id: string
  type: RecordType
  time: number

  // visit
  place?: string
  doctor?: string
  reason?: string
  /** Follow-up appointment, if one was booked. */
  followUp?: number | null

  // vaccine
  vaccine?: string

  // growth
  weightKg?: number
  lengthCm?: number
  headCm?: number

  // question for the doctor
  text?: string
  done?: boolean

  note?: string
  by: string
  byName: string
  updatedAt: number
}

export type Unsubscribe = () => void
