CREATE TABLE `monthlyConceptSettlements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`month` varchar(7) NOT NULL,
	`conceptId` varchar(96) NOT NULL,
	`source` varchar(48) NOT NULL,
	`description` varchar(220) NOT NULL,
	`direction` enum('income','expense') NOT NULL,
	`certainty` enum('confirmed','possible') NOT NULL DEFAULT 'confirmed',
	`currency` enum('EUR','USD') NOT NULL DEFAULT 'EUR',
	`amount` decimal(16,2) NOT NULL,
	`amountEur` decimal(16,2),
	`accountId` int,
	`status` enum('pending','settled') NOT NULL DEFAULT 'pending',
	`settledOn` date,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `monthlyConceptSettlements_id` PRIMARY KEY(`id`),
	CONSTRAINT `monthly_settlement_user_month_concept_unique` UNIQUE(`userId`,`month`,`conceptId`)
);
--> statement-breakpoint
ALTER TABLE `monthlyConceptSettlements` ADD CONSTRAINT `monthlyConceptSettlements_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `monthlyConceptSettlements` ADD CONSTRAINT `monthlyConceptSettlements_accountId_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `monthly_settlement_user_month_status_idx` ON `monthlyConceptSettlements` (`userId`,`month`,`status`);--> statement-breakpoint
CREATE INDEX `monthly_settlement_account_date_idx` ON `monthlyConceptSettlements` (`accountId`,`settledOn`);