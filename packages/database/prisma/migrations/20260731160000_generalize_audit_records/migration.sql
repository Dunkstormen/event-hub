-- Preserve the existing authorization history while making the table available
-- to every audited application domain.
RENAME TABLE `authorization_audit_records` TO `audit_records`;

ALTER TABLE `audit_records`
    RENAME INDEX `authorization_audit_records_created_at_idx` TO `audit_records_created_at_idx`,
    RENAME INDEX `authorization_audit_actor_created_idx` TO `audit_actor_created_idx`,
    RENAME INDEX `authorization_audit_target_created_idx` TO `audit_target_created_idx`;

ALTER TABLE `audit_records`
    DROP FOREIGN KEY `authorization_audit_records_actor_user_id_fkey`,
    ADD CONSTRAINT `audit_records_actor_user_id_fkey`
        FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE;
