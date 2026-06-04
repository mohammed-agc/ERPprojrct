export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name_ar: string
          name_en: string | null
          parent_id: string | null
          type: Database["public"]["Enums"]["account_type"]
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar: string
          name_en?: string | null
          parent_id?: string | null
          type: Database["public"]["Enums"]["account_type"]
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string | null
          parent_id?: string | null
          type?: Database["public"]["Enums"]["account_type"]
        }
        Relationships: [
          {
            foreignKeyName: "accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          document_code: string | null
          document_id: string | null
          document_type: string | null
          id: string
          module: string
          payload: Json | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          document_code?: string | null
          document_id?: string | null
          document_type?: string | null
          id?: string
          module: string
          payload?: Json | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          document_code?: string | null
          document_id?: string | null
          document_type?: string | null
          id?: string
          module?: string
          payload?: Json | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      credit_note_lines: {
        Row: {
          credit_note_id: string
          description: string
          id: string
          line_no: number
          line_total: number
          quantity: number
          unit_price: number
          vat_pct: number
          vehicle_id: string | null
        }
        Insert: {
          credit_note_id: string
          description: string
          id?: string
          line_no: number
          line_total?: number
          quantity?: number
          unit_price?: number
          vat_pct?: number
          vehicle_id?: string | null
        }
        Update: {
          credit_note_id?: string
          description?: string
          id?: string
          line_no?: number
          line_total?: number
          quantity?: number
          unit_price?: number
          vat_pct?: number
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_note_lines_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_note_lines_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "v_gov_cn_missing_cogs_reversal"
            referencedColumns: ["credit_note_id"]
          },
        ]
      }
      credit_notes: {
        Row: {
          cn_date: string
          cn_type: Database["public"]["Enums"]["cn_type"]
          cogs_journal_entry_id: string | null
          created_at: string
          created_by: string | null
          credit_note_no: string
          customer_id: string
          id: string
          invoice_id: string
          journal_entry_id: string | null
          notes: string | null
          reason: string
          status: string
          subtotal: number
          total: number
          updated_at: string
          vat_amount: number
        }
        Insert: {
          cn_date?: string
          cn_type?: Database["public"]["Enums"]["cn_type"]
          cogs_journal_entry_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_no: string
          customer_id: string
          id?: string
          invoice_id: string
          journal_entry_id?: string | null
          notes?: string | null
          reason?: string
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          vat_amount?: number
        }
        Update: {
          cn_date?: string
          cn_type?: Database["public"]["Enums"]["cn_type"]
          cogs_journal_entry_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_no?: string
          customer_id?: string
          id?: string
          invoice_id?: string
          journal_entry_id?: string | null
          notes?: string | null
          reason?: string
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          vat_amount?: number
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          city: string | null
          code: string
          created_at: string
          created_by: string | null
          credit_limit: number
          email: string | null
          grace_days: number
          id: string
          is_active: boolean
          name: string
          notes: string | null
          payment_terms_days: number
          phone: string | null
          settlement_policy: string
          updated_at: string
          updated_by: string | null
          vat_number: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          credit_limit?: number
          email?: string | null
          grace_days?: number
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          payment_terms_days?: number
          phone?: string | null
          settlement_policy?: string
          updated_at?: string
          updated_by?: string | null
          vat_number?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          credit_limit?: number
          email?: string | null
          grace_days?: number
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          payment_terms_days?: number
          phone?: string | null
          settlement_policy?: string
          updated_at?: string
          updated_by?: string | null
          vat_number?: string | null
        }
        Relationships: []
      }
      departments: {
        Row: {
          code: Database["public"]["Enums"]["department_code"]
          created_at: string
          id: string
          name_ar: string
          name_en: string
        }
        Insert: {
          code: Database["public"]["Enums"]["department_code"]
          created_at?: string
          id?: string
          name_ar: string
          name_en: string
        }
        Update: {
          code?: Database["public"]["Enums"]["department_code"]
          created_at?: string
          id?: string
          name_ar?: string
          name_en?: string
        }
        Relationships: []
      }
      goods_return_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cogs_reversal_je_id: string | null
          created_at: string
          created_by: string | null
          credit_note_id: string | null
          id: string
          inspected_at: string | null
          inspected_by: string | null
          inspection_notes: string | null
          reason: string | null
          reinstated_at: string | null
          request_no: string
          status: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cogs_reversal_je_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_id?: string | null
          id?: string
          inspected_at?: string | null
          inspected_by?: string | null
          inspection_notes?: string | null
          reason?: string | null
          reinstated_at?: string | null
          request_no: string
          status?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cogs_reversal_je_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_id?: string | null
          id?: string
          inspected_at?: string | null
          inspected_by?: string | null
          inspection_notes?: string | null
          reason?: string | null
          reinstated_at?: string | null
          request_no?: string
          status?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goods_return_requests_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_return_requests_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "v_gov_cn_missing_cogs_reversal"
            referencedColumns: ["credit_note_id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          description: string
          id: string
          invoice_id: string
          line_no: number
          line_total: number
          quantity: number
          unit_price: number
          vat_pct: number
        }
        Insert: {
          description: string
          id?: string
          invoice_id: string
          line_no: number
          line_total?: number
          quantity?: number
          unit_price?: number
          vat_pct?: number
        }
        Update: {
          description?: string
          id?: string
          invoice_id?: string
          line_no?: number
          line_total?: number
          quantity?: number
          unit_price?: number
          vat_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_gov_invoices_missing_cogs"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          branch: string | null
          cogs_journal_entry_id: string | null
          created_at: string
          created_by: string | null
          credited_amount: number
          customer_id: string
          due_date: string | null
          id: string
          invoice_date: string
          invoice_no: string
          journal_entry_id: string | null
          notes: string | null
          paid_amount: number
          payment_method: string | null
          posted_at: string | null
          posted_by: string | null
          qr_code: string | null
          sales_order_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          total: number
          updated_at: string
          vat_amount: number
        }
        Insert: {
          branch?: string | null
          cogs_journal_entry_id?: string | null
          created_at?: string
          created_by?: string | null
          credited_amount?: number
          customer_id: string
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_no: string
          journal_entry_id?: string | null
          notes?: string | null
          paid_amount?: number
          payment_method?: string | null
          posted_at?: string | null
          posted_by?: string | null
          qr_code?: string | null
          sales_order_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          vat_amount?: number
        }
        Update: {
          branch?: string | null
          cogs_journal_entry_id?: string | null
          created_at?: string
          created_by?: string | null
          credited_amount?: number
          customer_id?: string
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_no?: string
          journal_entry_id?: string | null
          notes?: string | null
          paid_amount?: number
          payment_method?: string | null
          posted_at?: string | null
          posted_by?: string | null
          qr_code?: string | null
          sales_order_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          entry_date: string
          entry_no: string
          id: string
          is_posted: boolean
          reference: string | null
          source_id: string | null
          source_type: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date?: string
          entry_no: string
          id?: string
          is_posted?: boolean
          reference?: string | null
          source_id?: string | null
          source_type?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_date?: string
          entry_no?: string
          id?: string
          is_posted?: boolean
          reference?: string | null
          source_id?: string | null
          source_type?: string | null
        }
        Relationships: []
      }
      journal_entry_lines: {
        Row: {
          account_id: string
          credit: number
          debit: number
          description: string | null
          entry_id: string
          id: string
        }
        Insert: {
          account_id: string
          credit?: number
          debit?: number
          description?: string | null
          entry_id: string
          id?: string
        }
        Update: {
          account_id?: string
          credit?: number
          debit?: number
          description?: string | null
          entry_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          invoice_id: string | null
          method: string
          notes: string | null
          payment_date: string
          payment_no: string
          reference: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          invoice_id?: string | null
          method?: string
          notes?: string | null
          payment_date?: string
          payment_no: string
          reference?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          invoice_id?: string | null
          method?: string
          notes?: string | null
          payment_date?: string
          payment_no?: string
          reference?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          department_id: string | null
          employee_no: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          department_id?: string | null
          employee_no?: string | null
          full_name: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          department_id?: string | null
          employee_no?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          permission_code: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          permission_code: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          permission_code?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      sales_order_lines: {
        Row: {
          description: string
          discount_pct: number
          id: string
          line_no: number
          line_total: number
          order_id: string
          quantity: number
          unit_price: number
          vat_pct: number
          vehicle_id: string | null
        }
        Insert: {
          description: string
          discount_pct?: number
          id?: string
          line_no: number
          line_total?: number
          order_id: string
          quantity?: number
          unit_price?: number
          vat_pct?: number
          vehicle_id?: string | null
        }
        Update: {
          description?: string
          discount_pct?: number
          id?: string
          line_no?: number
          line_total?: number
          order_id?: string
          quantity?: number
          unit_price?: number
          vat_pct?: number
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_gov_sold_vehicles_without_cogs"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "sales_order_lines_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_gov_vehicles_missing_cost"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "sales_order_lines_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          department_code: Database["public"]["Enums"]["department_code"]
          id: string
          notes: string | null
          order_date: string
          order_no: string
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
          vat_amount: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          department_code?: Database["public"]["Enums"]["department_code"]
          id?: string
          notes?: string | null
          order_date?: string
          order_no: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          vat_amount?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          department_code?: Database["public"]["Enums"]["department_code"]
          id?: string
          notes?: string | null
          order_date?: string
          order_no?: string
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicle_costs: {
        Row: {
          amount: number
          cost_date: string
          cost_type: Database["public"]["Enums"]["vehicle_cost_type"]
          created_at: string
          created_by: string | null
          id: string
          journal_entry_id: string | null
          notes: string | null
          source_reference: string | null
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          amount: number
          cost_date?: string
          cost_type: Database["public"]["Enums"]["vehicle_cost_type"]
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          source_reference?: string | null
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          amount?: number
          cost_date?: string
          cost_type?: Database["public"]["Enums"]["vehicle_cost_type"]
          created_at?: string
          created_by?: string | null
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          source_reference?: string | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          brand: string
          code: string
          color: string | null
          cost_price: number
          created_at: string
          created_by: string | null
          id: string
          mileage: number | null
          model: string
          name: string
          notes: string | null
          sale_price: number
          status: Database["public"]["Enums"]["vehicle_status"]
          updated_at: string
          vin: string | null
          year: number
        }
        Insert: {
          brand: string
          code: string
          color?: string | null
          cost_price?: number
          created_at?: string
          created_by?: string | null
          id?: string
          mileage?: number | null
          model: string
          name: string
          notes?: string | null
          sale_price?: number
          status?: Database["public"]["Enums"]["vehicle_status"]
          updated_at?: string
          vin?: string | null
          year: number
        }
        Update: {
          brand?: string
          code?: string
          color?: string | null
          cost_price?: number
          created_at?: string
          created_by?: string | null
          id?: string
          mileage?: number | null
          model?: string
          name?: string
          notes?: string | null
          sale_price?: number
          status?: Database["public"]["Enums"]["vehicle_status"]
          updated_at?: string
          vin?: string | null
          year?: number
        }
        Relationships: []
      }
    }
    Views: {
      v_gov_cn_missing_cogs_reversal: {
        Row: {
          cn_type: Database["public"]["Enums"]["cn_type"] | null
          credit_note_id: string | null
          credit_note_no: string | null
          gap: string | null
          vehicle_id: string | null
          vehicle_status: string | null
        }
        Relationships: []
      }
      v_gov_invoices_missing_cogs: {
        Row: {
          id: string | null
          invoice_date: string | null
          invoice_no: string | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          total: number | null
        }
        Insert: {
          id?: string | null
          invoice_date?: string | null
          invoice_no?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          total?: number | null
        }
        Update: {
          id?: string | null
          invoice_date?: string | null
          invoice_no?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          total?: number | null
        }
        Relationships: []
      }
      v_gov_sold_vehicles_without_cogs: {
        Row: {
          brand: string | null
          cost_price: number | null
          model: string | null
          status: Database["public"]["Enums"]["vehicle_status"] | null
          vehicle_id: string | null
          vin: string | null
        }
        Insert: {
          brand?: string | null
          cost_price?: number | null
          model?: string | null
          status?: Database["public"]["Enums"]["vehicle_status"] | null
          vehicle_id?: string | null
          vin?: string | null
        }
        Update: {
          brand?: string | null
          cost_price?: number | null
          model?: string | null
          status?: Database["public"]["Enums"]["vehicle_status"] | null
          vehicle_id?: string | null
          vin?: string | null
        }
        Relationships: []
      }
      v_gov_vehicles_missing_cost: {
        Row: {
          brand: string | null
          model: string | null
          status: Database["public"]["Enums"]["vehicle_status"] | null
          vehicle_id: string | null
          vin: string | null
        }
        Insert: {
          brand?: string | null
          model?: string | null
          status?: Database["public"]["Enums"]["vehicle_status"] | null
          vehicle_id?: string | null
          vin?: string | null
        }
        Update: {
          brand?: string | null
          model?: string | null
          status?: Database["public"]["Enums"]["vehicle_status"] | null
          vehicle_id?: string | null
          vin?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_list_sessions: {
        Args: never
        Returns: {
          aal: string
          created_at: string
          email: string
          full_name: string
          ip: string
          not_after: string
          refreshed_at: string
          session_id: string
          updated_at: string
          user_agent: string
          user_id: string
        }[]
      }
      approve_goods_return: { Args: { p_request_id: string }; Returns: string }
      can_manage_customer_finance: {
        Args: { _user_id: string }
        Returns: boolean
      }
      compute_vehicle_landed_cost: {
        Args: { p_vehicle_id: string }
        Returns: {
          additional_costs: number
          landed_cost: number
          purchase_cost: number
          vehicle_id: string
        }[]
      }
      compute_vehicle_pnl: {
        Args: { p_vehicle_id: string }
        Returns: {
          additional_costs: number
          credit_notes: number
          discounts: number
          gross_profit: number
          landed_cost: number
          net_profit: number
          purchase_cost: number
          sale_revenue: number
          vehicle_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_manager_or_admin: { Args: { _user_id: string }; Returns: boolean }
      post_credit_note_journal: { Args: { p_cn_id: string }; Returns: string }
      post_invoice_journal: { Args: { p_invoice_id: string }; Returns: string }
      post_payment_journal: { Args: { p_payment_id: string }; Returns: string }
      user_department: { Args: { _user_id: string }; Returns: string }
    }
    Enums: {
      account_type: "asset" | "liability" | "equity" | "revenue" | "expense"
      app_role:
        | "admin"
        | "manager"
        | "employee"
        | "general_manager"
        | "purchasing_officer"
        | "purchasing_manager"
        | "sales_officer"
        | "sales_manager"
        | "accountant"
        | "treasury_officer"
        | "inventory_officer"
        | "receiving_officer"
        | "inspection_officer"
        | "workshop_manager"
        | "spare_parts_manager"
      cn_type: "cancellation" | "return" | "price_adjustment" | "discount"
      department_code:
        | "vehicles"
        | "spare_parts"
        | "workshop"
        | "accounting"
        | "inventory"
        | "purchasing"
        | "sales"
        | "crm"
      invoice_status:
        | "draft"
        | "posted"
        | "paid"
        | "cancelled"
        | "partially_paid"
      order_status:
        | "draft"
        | "confirmed"
        | "invoiced"
        | "cancelled"
        | "partially_paid"
        | "paid"
        | "delivered"
      vehicle_cost_type:
        | "freight"
        | "customs"
        | "transportation"
        | "preparation"
        | "registration"
        | "insurance"
        | "repair"
        | "other"
      vehicle_status: "available" | "reserved" | "sold" | "delivered"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_type: ["asset", "liability", "equity", "revenue", "expense"],
      app_role: [
        "admin",
        "manager",
        "employee",
        "general_manager",
        "purchasing_officer",
        "purchasing_manager",
        "sales_officer",
        "sales_manager",
        "accountant",
        "treasury_officer",
        "inventory_officer",
        "receiving_officer",
        "inspection_officer",
        "workshop_manager",
        "spare_parts_manager",
      ],
      cn_type: ["cancellation", "return", "price_adjustment", "discount"],
      department_code: [
        "vehicles",
        "spare_parts",
        "workshop",
        "accounting",
        "inventory",
        "purchasing",
        "sales",
        "crm",
      ],
      invoice_status: [
        "draft",
        "posted",
        "paid",
        "cancelled",
        "partially_paid",
      ],
      order_status: [
        "draft",
        "confirmed",
        "invoiced",
        "cancelled",
        "partially_paid",
        "paid",
        "delivered",
      ],
      vehicle_cost_type: [
        "freight",
        "customs",
        "transportation",
        "preparation",
        "registration",
        "insurance",
        "repair",
        "other",
      ],
      vehicle_status: ["available", "reserved", "sold", "delivered"],
    },
  },
} as const
