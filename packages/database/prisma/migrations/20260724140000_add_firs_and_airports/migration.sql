-- CreateTable
CREATE TABLE `firs` (
    `id` VARCHAR(30) NOT NULL,
    `icao_code` CHAR(4) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `vacc_id` VARCHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `firs_icao_code_key`(`icao_code`),
    INDEX `firs_vacc_id_active_idx`(`vacc_id`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `airports` (
    `id` VARCHAR(30) NOT NULL,
    `icao_code` CHAR(4) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `fir_id` VARCHAR(30) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `airports_icao_code_key`(`icao_code`),
    INDEX `airports_fir_id_active_idx`(`fir_id`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `firs` ADD CONSTRAINT `firs_vacc_id_fkey` FOREIGN KEY (`vacc_id`) REFERENCES `vaccs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `airports` ADD CONSTRAINT `airports_fir_id_fkey` FOREIGN KEY (`fir_id`) REFERENCES `firs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
