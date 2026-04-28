export interface Profile {
  id: string
  name: string
  photo_url: string | null
  bio: string | null
  poll_type: 'slider' | 'multiple_choice' | 'open_text' | null
  poll_question: string | null
  poll_options: string[] | null
  note_intro: string | null
  instagram: string | null
  survey_link: string | null
  created_at: string
}

export interface Scan {
  id: string
  scanned_at: string
  session_token: string
  ip_hash: string | null
}

export interface Response {
  id: string
  session_token: string
  poll_answer: string | null
  comment: string | null
  commenter_name: string | null
  device_hash: string | null
  submitted_at: string
}

// Database shape expected by @supabase/supabase-js v2 — flat Insert/Update types + Relationships
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: {
          id?: string
          name: string
          photo_url?: string | null
          bio?: string | null
          poll_type?: 'slider' | 'multiple_choice' | 'open_text' | null
          poll_question?: string | null
          poll_options?: string[] | null
          note_intro?: string | null
          instagram?: string | null
          survey_link?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          photo_url?: string | null
          bio?: string | null
          poll_type?: 'slider' | 'multiple_choice' | 'open_text' | null
          poll_question?: string | null
          poll_options?: string[] | null
          note_intro?: string | null
          instagram?: string | null
          survey_link?: string | null
          created_at?: string
        }
        Relationships: []
      }
      scans: {
        Row: Scan
        Insert: {
          id?: string
          scanned_at?: string
          session_token: string
          ip_hash?: string | null
        }
        Update: {
          id?: string
          scanned_at?: string
          session_token?: string
          ip_hash?: string | null
        }
        Relationships: []
      }
      responses: {
        Row: Response
        Insert: {
          id?: string
          session_token: string
          poll_answer?: string | null
          comment?: string | null
          commenter_name?: string | null
          device_hash?: string | null
          submitted_at?: string
        }
        Update: {
          id?: string
          session_token?: string
          poll_answer?: string | null
          comment?: string | null
          commenter_name?: string | null
          device_hash?: string | null
          submitted_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
