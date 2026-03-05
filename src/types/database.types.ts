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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      atividades_log: {
        Row: {
          acao: string
          created_at: string | null
          dados_anteriores: Json | null
          dados_novos: Json | null
          id: string
          registro_id: string
          tabela_afetada: string
          usuario_email: string
        }
        Insert: {
          acao: string
          created_at?: string | null
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: string
          registro_id: string
          tabela_afetada: string
          usuario_email: string
        }
        Update: {
          acao?: string
          created_at?: string | null
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: string
          registro_id?: string
          tabela_afetada?: string
          usuario_email?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          aniversario: string | null
          cidade: string | null
          cnpj_contrato: string | null
          created_at: string | null
          deleted_at: string | null
          empresa_label: string
          estado: string | null
          id: string
          link_asana: string | null
          nome_cliente: string
          pais: string | null
          segmento: string | null
          status_cliente:
            | Database["public"]["Enums"]["enum_status_cliente"]
            | null
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          aniversario?: string | null
          cidade?: string | null
          cnpj_contrato?: string | null
          created_at?: string | null
          deleted_at?: string | null
          empresa_label: string
          estado?: string | null
          id?: string
          link_asana?: string | null
          nome_cliente: string
          pais?: string | null
          segmento?: string | null
          status_cliente?:
            | Database["public"]["Enums"]["enum_status_cliente"]
            | null
          telefone?: string | null
          updated_at?: string | null
        }
        Update: {
          aniversario?: string | null
          cidade?: string | null
          cnpj_contrato?: string | null
          created_at?: string | null
          deleted_at?: string | null
          empresa_label?: string
          estado?: string | null
          id?: string
          link_asana?: string | null
          nome_cliente?: string
          pais?: string | null
          segmento?: string | null
          status_cliente?:
            | Database["public"]["Enums"]["enum_status_cliente"]
            | null
          telefone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      contratos: {
        Row: {
          agencia_id: string | null
          cliente_id: string
          closer_id: string | null
          created_at: string | null
          data_inicio: string
          deleted_at: string | null
          id: string
          imposto_percentual: number | null
          parcelas_total: number
          periodicidade:
            | Database["public"]["Enums"]["enum_periodicidade"]
            | null
          programa_id: string | null
          sdr_id: string | null
          tipo_contrato: Database["public"]["Enums"]["enum_tipo_contrato"]
          valor_base_parcela: number
        }
        Insert: {
          agencia_id?: string | null
          cliente_id: string
          closer_id?: string | null
          created_at?: string | null
          data_inicio: string
          deleted_at?: string | null
          id?: string
          imposto_percentual?: number | null
          parcelas_total: number
          periodicidade?:
            | Database["public"]["Enums"]["enum_periodicidade"]
            | null
          programa_id?: string | null
          sdr_id?: string | null
          tipo_contrato: Database["public"]["Enums"]["enum_tipo_contrato"]
          valor_base_parcela: number
        }
        Update: {
          agencia_id?: string | null
          cliente_id?: string
          closer_id?: string | null
          created_at?: string | null
          data_inicio?: string
          deleted_at?: string | null
          id?: string
          imposto_percentual?: number | null
          parcelas_total?: number
          periodicidade?:
            | Database["public"]["Enums"]["enum_periodicidade"]
            | null
          programa_id?: string | null
          sdr_id?: string | null
          tipo_contrato?: Database["public"]["Enums"]["enum_tipo_contrato"]
          valor_base_parcela?: number
        }
        Relationships: [
          {
            foreignKeyName: "contratos_agencia_id_fkey"
            columns: ["agencia_id"]
            isOneToOne: false
            referencedRelation: "dim_agencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "vw_contas_a_receber"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "contratos_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "dim_equipe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_programa_id_fkey"
            columns: ["programa_id"]
            isOneToOne: false
            referencedRelation: "dim_programas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_sdr_id_fkey"
            columns: ["sdr_id"]
            isOneToOne: false
            referencedRelation: "dim_equipe"
            referencedColumns: ["id"]
          },
        ]
      }
      dim_agencias: {
        Row: {
          id: string
          nome: string
        }
        Insert: {
          id?: string
          nome: string
        }
        Update: {
          id?: string
          nome?: string
        }
        Relationships: []
      }
      dim_equipe: {
        Row: {
          ativo: boolean | null
          cargo: string | null
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean | null
          cargo?: string | null
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean | null
          cargo?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      dim_programas: {
        Row: {
          id: string
          nome: string
        }
        Insert: {
          id?: string
          nome: string
        }
        Update: {
          id?: string
          nome?: string
        }
        Relationships: []
      }
      pagamentos: {
        Row: {
          created_at: string | null
          data_pagamento: string
          disponivel_em: string
          id: string
          parcela_id: string
          plataforma: Database["public"]["Enums"]["enum_plataforma"]
          status_pagamento:
            | Database["public"]["Enums"]["enum_status_pagamento"]
            | null
          valor_pago: number
        }
        Insert: {
          created_at?: string | null
          data_pagamento?: string
          disponivel_em: string
          id?: string
          parcela_id: string
          plataforma: Database["public"]["Enums"]["enum_plataforma"]
          status_pagamento?:
            | Database["public"]["Enums"]["enum_status_pagamento"]
            | null
          valor_pago: number
        }
        Update: {
          created_at?: string | null
          data_pagamento?: string
          disponivel_em?: string
          id?: string
          parcela_id?: string
          plataforma?: Database["public"]["Enums"]["enum_plataforma"]
          status_pagamento?:
            | Database["public"]["Enums"]["enum_status_pagamento"]
            | null
          valor_pago?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_parcela_id_fkey"
            columns: ["parcela_id"]
            isOneToOne: true
            referencedRelation: "parcelas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_parcela_id_fkey"
            columns: ["parcela_id"]
            isOneToOne: true
            referencedRelation: "vw_contas_a_receber"
            referencedColumns: ["parcela_id"]
          },
        ]
      }
      parcelas: {
        Row: {
          categoria:
            | Database["public"]["Enums"]["enum_categoria_parcela"]
            | null
          contrato_id: string
          created_at: string | null
          data_vencimento: string
          deleted_at: string | null
          id: string
          juros_aplicado: number | null
          numero_referencia: number
          observacao: string | null
          status_manual_override:
            | Database["public"]["Enums"]["enum_status_manual"]
            | null
          sub_indice: number | null
          tipo_parcela: Database["public"]["Enums"]["enum_tipo_parcela"] | null
          updated_at: string | null
          valor_previsto: number
        }
        Insert: {
          categoria?:
            | Database["public"]["Enums"]["enum_categoria_parcela"]
            | null
          contrato_id: string
          created_at?: string | null
          data_vencimento: string
          deleted_at?: string | null
          id?: string
          juros_aplicado?: number | null
          numero_referencia: number
          observacao?: string | null
          status_manual_override?:
            | Database["public"]["Enums"]["enum_status_manual"]
            | null
          sub_indice?: number | null
          tipo_parcela?: Database["public"]["Enums"]["enum_tipo_parcela"] | null
          updated_at?: string | null
          valor_previsto: number
        }
        Update: {
          categoria?:
            | Database["public"]["Enums"]["enum_categoria_parcela"]
            | null
          contrato_id?: string
          created_at?: string | null
          data_vencimento?: string
          deleted_at?: string | null
          id?: string
          juros_aplicado?: number | null
          numero_referencia?: number
          observacao?: string | null
          status_manual_override?:
            | Database["public"]["Enums"]["enum_status_manual"]
            | null
          sub_indice?: number | null
          tipo_parcela?: Database["public"]["Enums"]["enum_tipo_parcela"] | null
          updated_at?: string | null
          valor_previsto?: number
        }
        Relationships: [
          {
            foreignKeyName: "parcelas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vw_contas_a_receber: {
        Row: {
          cliente_id: string | null
          data_vencimento: string | null
          dias_atraso: number | null
          disponivel_em: string | null
          empresa_label: string | null
          imposto_retido: number | null
          nome_cliente: string | null
          numero_referencia: number | null
          parcela_id: string | null
          plataforma: Database["public"]["Enums"]["enum_plataforma"] | null
          previsao_imposto: number | null
          status_cliente:
            | Database["public"]["Enums"]["enum_status_cliente"]
            | null
          status_dinamico: string | null
          valor_liquido: number | null
          valor_pago: number | null
          valor_total_cobrado: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      enum_categoria_parcela:
        | "NOVOS CLIENTES"
        | "UPSELL"
        | "BASE"
        | "PONTUAL"
        | "OUTROS"
        | "REEMBOLSOS"
        | "À VISTA"
        | "INADIMPLENTE RECEBIDO"
      enum_periodicidade:
        | "MENSAL"
        | "QUINZENAL"
        | "SEMANAL"
        | "TRIMESTRAL"
        | "SEMESTRAL"
        | "ANUAL"
      enum_plataforma: "PIX" | "IUGU" | "STRIPE BRASIL" | "STRIPE EUA"
      enum_status_cliente:
        | "ATIVO"
        | "INADIMPLENTE"
        | "QUEBRA DE CONTRATO"
        | "CONTRATO ENCERRADO"
        | "CHECKOUT"
        | "INATIVO"
      enum_status_manual:
        | "NORMAL"
        | "INADIMPLENTE"
        | "POSSUI INADIMPLENCIA"
        | "PERDA DE FATURAMENTO"
        | "FINALIZAR PROJETO"
        | "RENOVAR CONTRATO"
        | "CONTRATO À VISTA"
        | "QUEBRA DE CONTRATO"
      enum_status_pagamento: "PROCESSANDO" | "RECEBIDO"
      enum_tipo_contrato: "RECORRENTE" | "À VISTA" | "PONTUAL"
      enum_tipo_parcela:
        | "CONTRATO"
        | "ADICIONAL"
        | "CONTRATO (ADICIONAL)"
        | "CONTRATO ENCERRADO"
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
      enum_categoria_parcela: [
        "NOVOS CLIENTES",
        "UPSELL",
        "BASE",
        "PONTUAL",
        "OUTROS",
        "REEMBOLSOS",
        "À VISTA",
        "INADIMPLENTE RECEBIDO",
      ],
      enum_periodicidade: [
        "MENSAL",
        "QUINZENAL",
        "SEMANAL",
        "TRIMESTRAL",
        "SEMESTRAL",
        "ANUAL",
      ],
      enum_plataforma: ["PIX", "IUGU", "STRIPE BRASIL", "STRIPE EUA"],
      enum_status_cliente: [
        "ATIVO",
        "INADIMPLENTE",
        "QUEBRA DE CONTRATO",
        "CONTRATO ENCERRADO",
        "CHECKOUT",
        "INATIVO",
      ],
      enum_status_manual: [
        "NORMAL",
        "INADIMPLENTE",
        "POSSUI INADIMPLENCIA",
        "PERDA DE FATURAMENTO",
        "FINALIZAR PROJETO",
        "RENOVAR CONTRATO",
        "CONTRATO À VISTA",
        "QUEBRA DE CONTRATO",
      ],
      enum_status_pagamento: ["PROCESSANDO", "RECEBIDO"],
      enum_tipo_contrato: ["RECORRENTE", "À VISTA", "PONTUAL"],
      enum_tipo_parcela: [
        "CONTRATO",
        "ADICIONAL",
        "CONTRATO (ADICIONAL)",
        "CONTRATO ENCERRADO",
      ],
    },
  },
} as const
