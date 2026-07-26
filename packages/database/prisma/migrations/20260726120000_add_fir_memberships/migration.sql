-- CreateTable
CREATE TABLE `fir_memberships` (
    `id` VARCHAR(30) NOT NULL,
    `user_id` VARCHAR(30) NOT NULL,
    `fir_id` VARCHAR(30) NOT NULL,
    `source` ENUM('AUTOMATIC', 'MANUAL') NOT NULL,
    `status` ENUM('ACTIVE', 'REVOKED') NOT NULL,
    `source_provider` VARCHAR(64) NULL,
    `reason` VARCHAR(500) NULL,
    `changed_by_user_id` VARCHAR(30) NULL,
    `active_since` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fir_memberships_user_id_fir_id_key`(`user_id`, `fir_id`),
    INDEX `fir_memberships_fir_id_status_idx`(`fir_id`, `status`),
    INDEX `fir_memberships_user_id_status_idx`(`user_id`, `status`),
    INDEX `fir_memberships_source_status_idx`(`source`, `status`),
    INDEX `fir_memberships_actor_updated_idx`(`changed_by_user_id`, `updated_at`),
    PRIMARY KEY (`id`),
    CONSTRAINT `fir_memberships_source_check` CHECK (
        (`source` = 'AUTOMATIC' AND `source_provider` IS NOT NULL)
        OR (
            `source` = 'MANUAL'
            AND `source_provider` IS NULL
            AND `reason` IS NOT NULL
        )
    ),
    CONSTRAINT `fir_memberships_status_check` CHECK (
        (`status` = 'ACTIVE' AND `revoked_at` IS NULL)
        OR (`status` = 'REVOKED' AND `revoked_at` IS NOT NULL)
    )
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `fir_memberships` ADD CONSTRAINT `fir_memberships_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fir_memberships` ADD CONSTRAINT `fir_memberships_fir_id_fkey` FOREIGN KEY (`fir_id`) REFERENCES `firs`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `fir_memberships` ADD CONSTRAINT `fir_memberships_changed_by_user_id_fkey` FOREIGN KEY (`changed_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
