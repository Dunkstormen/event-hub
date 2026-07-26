-- CreateTable
CREATE TABLE `authorization_audit_records` (
    `id` VARCHAR(30) NOT NULL,
    `actor_user_id` VARCHAR(30) NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `target_kind` VARCHAR(32) NOT NULL,
    `target_key` VARCHAR(191) NOT NULL,
    `summary` VARCHAR(500) NOT NULL,
    `before_state` JSON NULL,
    `after_state` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `authorization_audit_records_created_at_idx`(`created_at`),
    INDEX `authorization_audit_actor_created_idx`(`actor_user_id`, `created_at`),
    INDEX `authorization_audit_target_created_idx`(`target_kind`, `target_key`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `authorization_audit_records` ADD CONSTRAINT `authorization_audit_records_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
