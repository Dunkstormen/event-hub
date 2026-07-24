CREATE DATABASE IF NOT EXISTS `event_hub_shadow`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON `event_hub_shadow`.* TO 'event_hub'@'%';
