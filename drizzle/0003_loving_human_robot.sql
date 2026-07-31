ALTER TABLE `transactions` MODIFY COLUMN `kind` enum('extra_income','possible_income','possible_expense','extra_bill','card_expense','card_forecast','manual_income','manual_expense') NOT NULL;--> statement-breakpoint
ALTER TABLE `monthlyConceptSettlements` ADD `plannedAmount` decimal(16,2);--> statement-breakpoint
ALTER TABLE `monthlyConceptSettlements` ADD `plannedAmountEur` decimal(16,2);