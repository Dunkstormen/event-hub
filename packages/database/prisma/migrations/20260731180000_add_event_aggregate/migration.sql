-- CreateTable
CREATE TABLE `events` (
    `id` VARCHAR(30) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `short_description` VARCHAR(500) NOT NULL,
    `description` TEXT NOT NULL,
    `banner_storage_key` VARCHAR(191) NULL,
    `rostering_type` ENUM('OPEN_INTEREST', 'PREDEFINED') NOT NULL,
    `lifecycle_state` ENUM('DRAFT', 'PUBLISHED', 'CANCELLED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `cancellation_reason` VARCHAR(500) NULL,
    `local_start` CHAR(19) NOT NULL,
    `local_end` CHAR(19) NOT NULL,
    `time_zone` VARCHAR(64) NOT NULL,
    `owner_fir_id` VARCHAR(30) NOT NULL,
    `created_by_user_id` VARCHAR(30) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `events_owner_fir_id_lifecycle_state_idx`(`owner_fir_id`, `lifecycle_state`),
    INDEX `events_lifecycle_state_local_start_idx`(`lifecycle_state`, `local_start`),
    INDEX `events_created_by_user_id_created_at_idx`(`created_by_user_id`, `created_at`),
    CONSTRAINT `events_schedule_order_check` CHECK (`local_end` > `local_start`),
    CONSTRAINT `events_cancellation_reason_check` CHECK (
        `lifecycle_state` <> 'CANCELLED'
        OR (`cancellation_reason` IS NOT NULL AND CHAR_LENGTH(TRIM(`cancellation_reason`)) > 0)
    ),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_firs` (
    `event_id` VARCHAR(30) NOT NULL,
    `fir_id` VARCHAR(30) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `event_firs_fir_id_event_id_idx`(`fir_id`, `event_id`),
    PRIMARY KEY (`event_id`, `fir_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_airports` (
    `event_id` VARCHAR(30) NOT NULL,
    `airport_id` VARCHAR(30) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `event_airports_airport_id_event_id_idx`(`airport_id`, `event_id`),
    PRIMARY KEY (`event_id`, `airport_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `events` ADD CONSTRAINT `events_owner_fir_id_fkey` FOREIGN KEY (`owner_fir_id`) REFERENCES `firs`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `events` ADD CONSTRAINT `events_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `event_firs` ADD CONSTRAINT `event_firs_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `event_firs` ADD CONSTRAINT `event_firs_fir_id_fkey` FOREIGN KEY (`fir_id`) REFERENCES `firs`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `event_airports` ADD CONSTRAINT `event_airports_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `event_airports` ADD CONSTRAINT `event_airports_airport_id_fkey` FOREIGN KEY (`airport_id`) REFERENCES `airports`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
