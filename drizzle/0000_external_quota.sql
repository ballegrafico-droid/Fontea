CREATE TABLE `external_usage` (
  `day` text NOT NULL,
  `key_hash` text NOT NULL,
  `used` integer NOT NULL,
  PRIMARY KEY (`day`, `key_hash`)
);
