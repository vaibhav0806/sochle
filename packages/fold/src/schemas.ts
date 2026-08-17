import { z } from "zod";

const nullableArray = <T extends z.ZodType>(schema: T) => z.array(schema.nullable()).nullable();

const accountReferenceSchema = z.object({
  account_id: z.string(),
  display_name: z.string(),
  included_via_parent: z.string().nullable().optional(),
  issuer: z.string().nullable().optional(),
  last_four: z.string().nullable().optional(),
  nickname: z.string().nullable().optional(),
});

const excludedAccountReferenceSchema = accountReferenceSchema.extend({ reason: z.string() });

const categorySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    subcategory: z.object({ id: z.string(), name: z.string() }).nullable(),
  })
  .nullable();

const transactionSchema = z.object({
  account_id: z.string(),
  account_in: z.string().nullable(),
  amount: z.number(),
  category: categorySchema,
  currency: z.string(),
  date: z.string(),
  excluded_from_cash_flow: z.boolean(),
  group_ids: z.array(z.string()).nullable(),
  id: z.string(),
  merchant_name: z.string().nullable(),
  narration: z.string(),
  notes: z.string().nullable(),
  refund_group_id: z.string().nullable(),
  remaining_refund_amount: z.number().nullable(),
  source: z.string(),
  type: z.string(),
});

export type FoldTransaction = z.infer<typeof transactionSchema>;

const cardCycleSchema = z
  .object({
    amount_spent_this_cycle: z.number(),
    available_credit_limit: z.number(),
    credit_limit: z.number(),
    id: z.string(),
    minimum_amount_due: z.number(),
    paid: z.boolean(),
    payment_due_date: z.string().nullable(),
    reconciled_at: z.string().nullable(),
    statement_date: z.string(),
    total_amount_due: z.number(),
  })
  .nullable();

export const foldSchemas = {
  totalBalance: z.object({
    as_of: z.string().nullable(),
    currency: z.string(),
    excluded_accounts: z
      .array(
        z.object({
          balance: z.number().nullable(),
          bank_name: z.string(),
          id: z.string(),
          reason: z.string(),
        })
      )
      .nullable(),
    included_accounts: z
      .array(z.object({ balance: z.number(), bank_name: z.string(), id: z.string() }))
      .nullable(),
    total: z.number(),
  }),
  bankAccounts: z.object({
    accounts: z
      .array(
        z.object({
          account_type: z.string().nullable(),
          balance: z.number().nullable(),
          bank_name: z.string(),
          currency: z.string(),
          holder_name: z.string().nullable(),
          id: z.string(),
          is_pending_connection: z.boolean(),
          is_secondary: z.boolean(),
          last_refreshed_at: z.string().nullable(),
          masked_number: z.string(),
          nickname: z.string().nullable(),
          tracking: z.string(),
        })
      )
      .nullable(),
  }),
  creditCards: z.object({
    credit_cards: z
      .array(
        z.object({
          card_last_four: z.string(),
          card_name: z.string(),
          currency: z.string(),
          current_cycle: cardCycleSchema,
          id: z.string(),
          issuer_name: z.string(),
          last_synced_at: z.string().nullable(),
          nickname: z.string().nullable(),
          outstanding: z.number(),
          previous_cycle: cardCycleSchema,
          relationship: z
            .object({
              child_account_ids: z.array(z.string()).nullable(),
              parent_account_id: z.string().nullable(),
              role: z.string(),
            })
            .nullable(),
        })
      )
      .nullable(),
  }),
  transactions: z.object({
    count: z.number().int().nonnegative(),
    next_cursor: z.string().nullable(),
    total_matched: z.number().int().nonnegative(),
    transactions: z.array(transactionSchema).nullable(),
  }),
  transactionDetail: z.object({ found: z.boolean(), transaction: transactionSchema.nullable() }),
  spendingSummary: z.object({
    categories: nullableArray(
      z.object({
        amount: z.number(),
        category_id: z.string(),
        category_name: z.string(),
        icons: z.array(z.unknown().nullable()).nullable().optional(),
        percentage_of_total: z.number(),
        transaction_count: z.number().int().nonnegative(),
      })
    ),
    excluded_accounts: nullableArray(
      z.object({ account_id: z.string(), account_type: z.string(), reason: z.string() })
    ),
    included_account_ids: z.array(z.string()).nullable(),
    month: z.number().int(),
    no_merchant: z
      .object({
        amount: z.number(),
        percentage_of_total: z.number(),
        transaction_count: z.number(),
      })
      .nullable(),
    total_amount: z.number(),
    untagged: z
      .object({
        amount: z.number(),
        percentage_of_total: z.number(),
        transaction_count: z.number(),
      })
      .nullable(),
    year: z.number().int(),
  }),
  recurringExpenses: z.object({
    expenses: z
      .array(
        z.object({
          amount: z.number().nullable(),
          average_amount_paid: z.number().nullable(),
          category_id: z.string().nullable(),
          category_name: z.string(),
          custom_frequency_data: z
            .object({ days: z.number(), months: z.number(), weeks: z.number(), years: z.number() })
            .nullable(),
          frequency: z.string(),
          id: z.string(),
          is_current_cycle_paid: z.boolean().nullable(),
          is_variable: z.boolean().nullable(),
          name: z.string(),
          next_due_date: z.string().nullable(),
          overdue_date: z.string().nullable(),
          status: z.string(),
        })
      )
      .nullable(),
    next_cursor: z.string().nullable(),
  }),
  upcomingCycles: z.object({
    cycles: z
      .array(
        z.object({
          actual_amount_paid: z.number().nullable(),
          amount: z.number().nullable(),
          category_id: z.string().nullable(),
          category_name: z.string(),
          due_date: z.string().nullable(),
          due_status: z.string(),
          expected_amount: z.number().nullable(),
          expense_id: z.string(),
          expense_name: z.string(),
          frequency: z.string(),
          id: z.string(),
          is_dummy: z.boolean(),
          is_variable: z.boolean().nullable(),
          overdue_date: z.string().nullable(),
        })
      )
      .nullable(),
  }),
  netWorth: z.object({
    as_of: z.string(),
    assets: z.array(z.unknown().nullable()).nullable(),
    currency: z.string(),
    groups: z.object({ debt: z.number(), investments: z.number(), liquid: z.number() }),
    liabilities: z.array(z.unknown().nullable()).nullable(),
    total: z.number(),
  }),
  netWorthHistory: z.object({
    currency: z.string(),
    end_date: z.string(),
    graph_data: nullableArray(z.object({ date: z.string(), value: z.number() })),
    per_class_graph_data: nullableArray(
      z.object({
        class: z.string(),
        series: nullableArray(z.object({ date: z.string(), value: z.number() })),
      })
    ),
    range: z.string(),
    start_date: z.string(),
    summary: z.object({
      change_percent: z.number(),
      change_value: z.number(),
      end_total: z.number(),
      per_class: nullableArray(
        z.object({
          change_percent: z.number(),
          change_value: z.number(),
          class: z.string(),
          class_enabled: z.boolean(),
          end: z.number(),
          excluded_accounts: nullableArray(excludedAccountReferenceSchema),
          included_accounts: nullableArray(accountReferenceSchema),
          start: z.number(),
        })
      ),
      start_total: z.number(),
    }),
  }),
  mutualFunds: z.object({
    breakdown_by_category: z.array(z.unknown()).nullable(),
    holdings_count: z.number(),
    last_refresh_date: z.string().nullable(),
    total_current_value: z.number(),
    total_gain_loss: z.number(),
    total_gain_loss_percent: z.number(),
    total_invested: z.number(),
  }),
  stocks: z.object({
    account_count: z.number(),
    equity_value: z.number(),
    etf_value: z.number(),
    last_refresh_date: z.string().nullable(),
    total_current_value: z.number(),
    total_holdings: z.number(),
    total_shares: z.number(),
  }),
};

export type FoldSnapshotResponses = {
  bankAccounts: z.infer<typeof foldSchemas.bankAccounts>;
  creditCards: z.infer<typeof foldSchemas.creditCards>;
  mutualFunds: z.infer<typeof foldSchemas.mutualFunds>;
  netWorth: z.infer<typeof foldSchemas.netWorth>;
  recurringExpenses: z.infer<typeof foldSchemas.recurringExpenses>;
  spendingSummary: z.infer<typeof foldSchemas.spendingSummary>;
  stocks: z.infer<typeof foldSchemas.stocks>;
  totalBalance: z.infer<typeof foldSchemas.totalBalance>;
  transactions: z.infer<typeof foldSchemas.transactions>;
  upcomingCycles: z.infer<typeof foldSchemas.upcomingCycles>;
};
