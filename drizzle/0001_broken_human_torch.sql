CREATE TABLE `accountBalanceSnapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`balance` decimal(16,2) NOT NULL,
	`recordedOn` date NOT NULL,
	`note` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accountBalanceSnapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `account_balances_account_day_unique` UNIQUE(`accountId`,`recordedOn`)
);
--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(140) NOT NULL,
	`type` enum('bank','cash','investment','wallet','other') NOT NULL DEFAULT 'bank',
	`currency` enum('EUR','USD') NOT NULL DEFAULT 'EUR',
	`institution` varchar(140),
	`includeInLiquidity` boolean NOT NULL DEFAULT true,
	`notes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `appSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`baseCurrency` enum('EUR','USD') NOT NULL DEFAULT 'EUR',
	`timezone` varchar(64) NOT NULL DEFAULT 'Europe/Madrid',
	`dashboardPreferences` json,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `appSettings_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`direction` enum('income','expense') NOT NULL,
	`color` varchar(16) NOT NULL DEFAULT '#4C7A68',
	`icon` varchar(64),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `categories_user_name_direction_unique` UNIQUE(`userId`,`name`,`direction`)
);
--> statement-breakpoint
CREATE TABLE `debts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`counterparty` varchar(160) NOT NULL,
	`direction` enum('in_favor','against') NOT NULL,
	`currency` enum('EUR','USD') NOT NULL DEFAULT 'EUR',
	`amount` decimal(16,2) NOT NULL,
	`originatedOn` date NOT NULL,
	`dueDate` date,
	`status` enum('open','settled','cancelled') NOT NULL DEFAULT 'open',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `debts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exchangeRates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`fromCurrency` enum('EUR','USD') NOT NULL,
	`toCurrency` enum('EUR','USD') NOT NULL DEFAULT 'EUR',
	`rate` decimal(18,8) NOT NULL,
	`effectiveOn` date NOT NULL,
	`note` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exchangeRates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `financings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`concept` varchar(180) NOT NULL,
	`provider` varchar(160),
	`currency` enum('EUR','USD') NOT NULL DEFAULT 'EUR',
	`monthlyAmount` decimal(16,2) NOT NULL,
	`totalAmount` decimal(16,2),
	`paymentDay` int NOT NULL DEFAULT 1,
	`startDate` date NOT NULL,
	`endDate` date NOT NULL,
	`status` enum('active','archived') NOT NULL DEFAULT 'active',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `financings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loanFeatures` (
	`id` int AUTO_INCREMENT NOT NULL,
	`loanId` int NOT NULL,
	`label` varchar(100) NOT NULL,
	`value` varchar(255) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `loanFeatures_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loanInstallments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`loanId` int NOT NULL,
	`installmentNumber` int NOT NULL,
	`dueDate` date NOT NULL,
	`totalPayment` decimal(16,2) NOT NULL,
	`principalPayment` decimal(16,2) NOT NULL,
	`interestPayment` decimal(16,2) NOT NULL,
	`remainingPrincipal` decimal(16,2) NOT NULL,
	`isPaid` boolean NOT NULL DEFAULT false,
	`paidOn` date,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `loanInstallments_id` PRIMARY KEY(`id`),
	CONSTRAINT `loan_installments_loan_number_unique` UNIQUE(`loanId`,`installmentNumber`)
);
--> statement-breakpoint
CREATE TABLE `loans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`lender` varchar(160),
	`currency` enum('EUR','USD') NOT NULL DEFAULT 'EUR',
	`originalPrincipal` decimal(16,2) NOT NULL,
	`currentPrincipal` decimal(16,2),
	`annualInterestRate` decimal(8,5) NOT NULL DEFAULT '0',
	`monthlyPayment` decimal(16,2) NOT NULL,
	`paymentDay` int NOT NULL DEFAULT 1,
	`startDate` date NOT NULL,
	`endDate` date NOT NULL,
	`amortizationMethod` enum('french','custom','manual') NOT NULL DEFAULT 'french',
	`status` enum('active','archived') NOT NULL DEFAULT 'active',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `loans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recurringTransactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`categoryId` int,
	`accountId` int,
	`name` varchar(180) NOT NULL,
	`direction` enum('income','expense') NOT NULL,
	`kind` enum('fixed_income','recurring_bill') NOT NULL,
	`certainty` enum('confirmed','possible') NOT NULL DEFAULT 'confirmed',
	`currency` enum('EUR','USD') NOT NULL DEFAULT 'EUR',
	`amount` decimal(16,2) NOT NULL,
	`dayOfMonth` int NOT NULL DEFAULT 1,
	`startDate` date NOT NULL,
	`endDate` date,
	`notes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `recurringTransactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`categoryId` int,
	`accountId` int,
	`description` varchar(220) NOT NULL,
	`direction` enum('income','expense') NOT NULL,
	`kind` enum('extra_income','possible_income','extra_bill','card_expense','manual_income','manual_expense') NOT NULL,
	`certainty` enum('confirmed','possible') NOT NULL DEFAULT 'confirmed',
	`currency` enum('EUR','USD') NOT NULL DEFAULT 'EUR',
	`amount` decimal(16,2) NOT NULL,
	`exchangeRateToEur` decimal(18,8),
	`effectiveDate` date NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `openId` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `accountBalanceSnapshots` ADD CONSTRAINT `accountBalanceSnapshots_accountId_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appSettings` ADD CONSTRAINT `appSettings_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `categories` ADD CONSTRAINT `categories_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `debts` ADD CONSTRAINT `debts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exchangeRates` ADD CONSTRAINT `exchangeRates_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `financings` ADD CONSTRAINT `financings_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loanFeatures` ADD CONSTRAINT `loanFeatures_loanId_loans_id_fk` FOREIGN KEY (`loanId`) REFERENCES `loans`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loanInstallments` ADD CONSTRAINT `loanInstallments_loanId_loans_id_fk` FOREIGN KEY (`loanId`) REFERENCES `loans`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loans` ADD CONSTRAINT `loans_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recurringTransactions` ADD CONSTRAINT `recurringTransactions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recurringTransactions` ADD CONSTRAINT `recurringTransactions_categoryId_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recurringTransactions` ADD CONSTRAINT `recurringTransactions_accountId_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_categoryId_categories_id_fk` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_accountId_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `account_balances_account_date_idx` ON `accountBalanceSnapshots` (`accountId`,`recordedOn`);--> statement-breakpoint
CREATE INDEX `accounts_user_active_idx` ON `accounts` (`userId`,`isActive`);--> statement-breakpoint
CREATE INDEX `categories_user_direction_idx` ON `categories` (`userId`,`direction`);--> statement-breakpoint
CREATE INDEX `debts_user_status_direction_idx` ON `debts` (`userId`,`status`,`direction`);--> statement-breakpoint
CREATE INDEX `exchange_rates_lookup_idx` ON `exchangeRates` (`userId`,`fromCurrency`,`toCurrency`,`effectiveOn`);--> statement-breakpoint
CREATE INDEX `financings_user_status_end_idx` ON `financings` (`userId`,`status`,`endDate`);--> statement-breakpoint
CREATE INDEX `loan_features_loan_sort_idx` ON `loanFeatures` (`loanId`,`sortOrder`);--> statement-breakpoint
CREATE INDEX `loan_installments_due_idx` ON `loanInstallments` (`loanId`,`dueDate`);--> statement-breakpoint
CREATE INDEX `loans_user_status_end_idx` ON `loans` (`userId`,`status`,`endDate`);--> statement-breakpoint
CREATE INDEX `recurring_transactions_user_active_idx` ON `recurringTransactions` (`userId`,`isActive`,`direction`);--> statement-breakpoint
CREATE INDEX `transactions_user_date_idx` ON `transactions` (`userId`,`effectiveDate`);--> statement-breakpoint
CREATE INDEX `transactions_user_kind_date_idx` ON `transactions` (`userId`,`kind`,`effectiveDate`);