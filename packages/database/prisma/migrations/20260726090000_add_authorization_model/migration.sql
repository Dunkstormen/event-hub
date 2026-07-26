-- CreateTable
CREATE TABLE `capabilities` (
    `key` VARCHAR(96) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(500) NOT NULL,
    `scope` ENUM('GLOBAL_ONLY', 'GLOBAL_OR_FIR') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` VARCHAR(30) NOT NULL,
    `key` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(500) NOT NULL,
    `scope` ENUM('GLOBAL', 'FIR') NOT NULL,
    `protected` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `roles_key_key`(`key`),
    INDEX `roles_scope_idx`(`scope`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_capabilities` (
    `role_id` VARCHAR(30) NOT NULL,
    `capability_key` VARCHAR(96) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `role_capabilities_capability_key_idx`(`capability_key`),
    PRIMARY KEY (`role_id`, `capability_key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_role_assignments` (
    `id` VARCHAR(30) NOT NULL,
    `user_id` VARCHAR(30) NOT NULL,
    `role_id` VARCHAR(30) NOT NULL,
    `fir_id` VARCHAR(30) NULL,
    `scope_key` VARCHAR(30) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `user_role_assignments_user_id_role_id_scope_key_key`(`user_id`, `role_id`, `scope_key`),
    INDEX `user_role_assignments_role_id_scope_key_idx`(`role_id`, `scope_key`),
    INDEX `user_role_assignments_fir_id_user_id_idx`(`fir_id`, `user_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `user_role_assignments_scope_check` CHECK (
        (`fir_id` IS NULL AND `scope_key` = 'GLOBAL')
        OR (`fir_id` IS NOT NULL AND `scope_key` = `fir_id`)
    )
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `role_capabilities` ADD CONSTRAINT `role_capabilities_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_capabilities` ADD CONSTRAINT `role_capabilities_capability_key_fkey` FOREIGN KEY (`capability_key`) REFERENCES `capabilities`(`key`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_role_assignments` ADD CONSTRAINT `user_role_assignments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_role_assignments` ADD CONSTRAINT `user_role_assignments_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_role_assignments` ADD CONSTRAINT `user_role_assignments_fir_id_fkey` FOREIGN KEY (`fir_id`) REFERENCES `firs`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
