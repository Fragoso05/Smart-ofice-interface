-- Reconstrução (teste local) do esquema atual, a partir das queries dos fluxos Node-RED.
CREATE TABLE access_users (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150) NOT NULL, contact VARCHAR(100), email VARCHAR(190),
  active TINYINT(1) DEFAULT 1, created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE access_cards (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, uid VARCHAR(50) NOT NULL, active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uid (uid), KEY user_id (user_id),
  CONSTRAINT access_cards_ibfk_1 FOREIGN KEY (user_id) REFERENCES access_users (id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE access_devices (id INT AUTO_INCREMENT PRIMARY KEY, device_id VARCHAR(80) NOT NULL, hardware_id VARCHAR(80) NOT NULL, name VARCHAR(100),
  door_id VARCHAR(80) NOT NULL DEFAULT 'main-door', active TINYINT(1) DEFAULT 1, online TINYINT(1) DEFAULT 0, firmware_version VARCHAR(40),
  ip_address VARCHAR(45), wifi_rssi INT, last_seen DATETIME, UNIQUE KEY device_id (device_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE access_permissions (id INT AUTO_INCREMENT PRIMARY KEY, card_id INT NOT NULL, door_id VARCHAR(80) NOT NULL, can_enter TINYINT(1) DEFAULT 0,
  can_exit TINYINT(1) DEFAULT 0, valid_from DATETIME NULL, valid_until DATETIME NULL,
  CONSTRAINT perm_card FOREIGN KEY (card_id) REFERENCES access_cards (id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE access_logs (id BIGINT AUTO_INCREMENT PRIMARY KEY, event_id VARCHAR(120) NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id INT NULL, card_id INT NULL, uid VARCHAR(50), device_id VARCHAR(80), reader_id VARCHAR(20), door_id VARCHAR(80),
  decision VARCHAR(20), reason VARCHAR(120), source VARCHAR(20), UNIQUE KEY event_id (event_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE access_registration_requests (id VARCHAR(80) PRIMARY KEY, device_id VARCHAR(80) NOT NULL, reader_id VARCHAR(20), name VARCHAR(150),
  contact VARCHAR(100), email VARCHAR(190), uid VARCHAR(50), status ENUM('waiting_card','completed','expired') NOT NULL DEFAULT 'waiting_card',
  expires_at DATETIME, completed_at DATETIME, created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dados existentes (como em produção hoje)
INSERT INTO access_devices (device_id, hardware_id, name, door_id, active, online, firmware_version, ip_address, last_seen)
VALUES ('esp32-door-01', 'AA:BB:CC:DD:EE:01', 'Porta principal', 'main-door', 1, 1, 'rc522-v2.0', '192.168.1.50', NOW() - INTERVAL 2 HOUR);
INSERT INTO access_users (name, contact) VALUES ('Ana Silva', '9100000'), ('João Costa', '9200000');
INSERT INTO access_cards (user_id, uid) VALUES (1, '04A1B201'), (2, '04A1B202');
INSERT INTO access_permissions (card_id, door_id, can_enter, can_exit) VALUES (1, 'main-door', 1, 1), (2, 'main-door', 1, 0);
INSERT INTO access_logs (event_id, created_at, uid, device_id, reader_id, door_id, decision, reason, source) VALUES
 ('e1', NOW() - INTERVAL 30 MINUTE, '04A1B201', 'esp32-door-01', 'outside', 'main-door', 'granted', 'access_granted', 'rfid'),
 ('e2', NOW() - INTERVAL 20 MINUTE, 'DEADBEEF', 'esp32-door-01', 'outside', 'main-door', 'denied', 'card_or_device_not_found', 'rfid'),
 ('e3', NOW() - INTERVAL 1 DAY, '04A1B202', 'esp32-door-01', 'inside', 'main-door', 'granted', 'access_granted', 'rfid');
