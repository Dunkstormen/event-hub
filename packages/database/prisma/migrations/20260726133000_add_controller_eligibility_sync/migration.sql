-- AlterTable
ALTER TABLE `fir_memberships`
    ADD COLUMN `provider_fresh_until` DATETIME(3) NULL;

-- Existing automatic rows predate provider evidence. Keep them visible but
-- immediately stale until the first successful synchronization replaces them.
UPDATE `fir_memberships`
SET `provider_fresh_until` = `updated_at`
WHERE `source` = 'AUTOMATIC';

ALTER TABLE `fir_memberships`
    DROP CHECK `fir_memberships_source_check`,
    ADD CONSTRAINT `fir_memberships_source_check` CHECK (
        (
            `source` = 'AUTOMATIC'
            AND `source_provider` IS NOT NULL
            AND `provider_fresh_until` IS NOT NULL
        )
        OR (
            `source` = 'MANUAL'
            AND `source_provider` IS NULL
            AND `provider_fresh_until` IS NULL
            AND `reason` IS NOT NULL
        )
    );

-- CreateTable
CREATE TABLE `eligibility_provider_states` (
    `provider` ENUM('CONTROL_CENTER', 'VATEUD') NOT NULL,
    `status` ENUM('SUCCEEDED', 'FAILED') NOT NULL,
    `last_attempted_at` DATETIME(3) NOT NULL,
    `last_succeeded_at` DATETIME(3) NULL,
    `fresh_until` DATETIME(3) NULL,
    `last_error_code` VARCHAR(64) NULL,
    `last_error_message` VARCHAR(500) NULL,
    `consecutive_failures` INTEGER NOT NULL DEFAULT 0,
    `records_seen` INTEGER NOT NULL DEFAULT 0,
    `next_retry_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `eligibility_provider_states_status_next_retry_at_idx`(`status`, `next_retry_at`),
    PRIMARY KEY (`provider`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `eligibility_sync_runs` (
    `id` VARCHAR(30) NOT NULL,
    `provider` ENUM('CONTROL_CENTER', 'VATEUD') NOT NULL,
    `trigger` ENUM('STARTUP', 'PERIODIC', 'ON_DEMAND') NOT NULL,
    `status` ENUM('RUNNING', 'SUCCEEDED', 'FAILED') NOT NULL,
    `started_at` DATETIME(3) NOT NULL,
    `completed_at` DATETIME(3) NULL,
    `fetched_at` DATETIME(3) NULL,
    `fresh_until` DATETIME(3) NULL,
    `controllers_seen` INTEGER NOT NULL DEFAULT 0,
    `memberships_changed` INTEGER NOT NULL DEFAULT 0,
    `error_code` VARCHAR(64) NULL,
    `error_message` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `eligibility_sync_runs_provider_started_at_idx`(`provider`, `started_at`),
    INDEX `eligibility_sync_runs_status_started_at_idx`(`status`, `started_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `controller_eligibility_snapshots` (
    `id` VARCHAR(30) NOT NULL,
    `user_id` VARCHAR(30) NOT NULL,
    `provider` ENUM('CONTROL_CENTER', 'VATEUD') NOT NULL,
    `rostered` BOOLEAN NOT NULL,
    `rating_code` VARCHAR(16) NULL,
    `rating_value` INTEGER NULL,
    `fetched_at` DATETIME(3) NOT NULL,
    `fresh_until` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `controller_eligibility_snapshots_user_id_provider_key`(`user_id`, `provider`),
    INDEX `controller_eligibility_snapshots_provider_fresh_until_idx`(`provider`, `fresh_until`),
    INDEX `controller_eligibility_snapshots_user_id_fresh_until_idx`(`user_id`, `fresh_until`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `controller_endorsements` (
    `id` VARCHAR(30) NOT NULL,
    `user_id` VARCHAR(30) NOT NULL,
    `provider` ENUM('CONTROL_CENTER', 'VATEUD') NOT NULL,
    `source_key` VARCHAR(191) NOT NULL,
    `kind` ENUM('EXAMINER', 'FACILITY', 'SOLO', 'TIER_1', 'TIER_2', 'VISITING') NOT NULL,
    `position` VARCHAR(32) NULL,
    `rating` VARCHAR(32) NULL,
    `valid_from` DATETIME(3) NULL,
    `valid_until` DATETIME(3) NULL,
    `fetched_at` DATETIME(3) NOT NULL,
    `fresh_until` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `controller_endorsements_user_id_provider_source_key_key`(`user_id`, `provider`, `source_key`),
    INDEX `controller_endorsements_user_id_kind_fresh_until_idx`(`user_id`, `kind`, `fresh_until`),
    INDEX `controller_endorsements_provider_fresh_until_idx`(`provider`, `fresh_until`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `known_controller_positions` (
    `id` VARCHAR(30) NOT NULL,
    `provider` ENUM('CONTROL_CENTER', 'VATEUD') NOT NULL,
    `callsign` VARCHAR(32) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `frequency` VARCHAR(16) NULL,
    `fetched_at` DATETIME(3) NOT NULL,
    `fresh_until` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `known_controller_positions_provider_callsign_key`(`provider`, `callsign`),
    INDEX `known_controller_positions_callsign_fresh_until_idx`(`callsign`, `fresh_until`),
    INDEX `known_controller_positions_provider_fresh_until_idx`(`provider`, `fresh_until`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `controller_eligibility_snapshots`
    ADD CONSTRAINT `controller_eligibility_snapshots_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `controller_endorsements`
    ADD CONSTRAINT `controller_endorsements_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
