-- ============================================================
-- Smart Office — gestão de dispositivos IoT, salas e registo RFID completo
-- MariaDB 10.5+ (testado em 11.8). Idempotente: pode ser executado mais de uma vez.
--
-- Importar no phpMyAdmin (separador "Importar") ANTES de ativar os fluxos
-- Node-RED "Smart Office Admin API v4" e "Smart Office Dispositivos v2".
-- Fazer cópia de segurança da base de dados antes de executar.
-- ============================================================

SET NAMES utf8mb4;

-- ------------------------------------------------------------
-- 1. Tipos de dispositivo (novos tipos = novas linhas, sem alterar o frontend)
--    config_schema: lista de campos [{key,label,type,min,max,default,options}]
--    type ∈ text | number | boolean | select
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS access_device_types (
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  label VARCHAR(80) NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'other',
  rfid_capable TINYINT(1) NOT NULL DEFAULT 0,
  config_schema LONGTEXT NULL,
  sort_order INT NOT NULL DEFAULT 100,
  active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO access_device_types (id, label, category, rfid_capable, sort_order, config_schema) VALUES
 ('esp32_rfid', 'ESP32 RFID', 'access', 1, 10,
  '[{"key":"readerModel","label":"Modelo do leitor","type":"select","options":[{"value":"RC522","label":"RC522"},{"value":"PN532","label":"PN532"}],"default":"RC522"},{"key":"relayDurationMs","label":"Duração do relé (ms)","type":"number","min":500,"max":15000,"default":4000}]'),
 ('door_controller', 'Controlador de porta', 'access', 0, 20,
  '[{"key":"relayDurationMs","label":"Duração do relé (ms)","type":"number","min":500,"max":15000,"default":4000},{"key":"hasDoorSensor","label":"Sensor de porta instalado","type":"boolean","default":false}]'),
 ('rfid_reader', 'Leitor RFID', 'access', 1, 30,
  '[{"key":"readerModel","label":"Modelo do leitor","type":"select","options":[{"value":"RC522","label":"RC522"},{"value":"PN532","label":"PN532"}],"default":"RC522"}]'),
 ('smart_relay', 'Relé inteligente', 'energy', 0, 40,
  '[{"key":"channels","label":"Número de canais","type":"number","min":1,"max":16,"default":1}]'),
 ('smart_outlet', 'Tomada inteligente', 'energy', 0, 50,
  '[{"key":"channels","label":"Número de tomadas","type":"number","min":1,"max":8,"default":1},{"key":"maxPowerW","label":"Potência máxima (W)","type":"number","min":1,"max":4000}]'),
 ('air_conditioner', 'Ar condicionado', 'climate', 0, 60,
  '[{"key":"brand","label":"Marca","type":"text"},{"key":"model","label":"Modelo","type":"text"}]'),
 ('presence_sensor', 'Sensor de presença', 'sensor', 0, 70,
  '[{"key":"timeoutSec","label":"Tempo sem presença (s)","type":"number","min":5,"max":3600,"default":60}]'),
 ('temp_humidity', 'Sensor de temperatura/humidade', 'sensor', 0, 80,
  '[{"key":"reportIntervalSec","label":"Intervalo de leitura (s)","type":"number","min":10,"max":3600,"default":60}]'),
 ('smart_lighting', 'Iluminação inteligente', 'lighting', 0, 90,
  '[{"key":"channels","label":"Número de circuitos","type":"number","min":1,"max":16,"default":1},{"key":"dimmable","label":"Regulável","type":"boolean","default":false}]'),
 ('other', 'Outro', 'other', 0, 999, '[]')
ON DUPLICATE KEY UPDATE label = VALUES(label), category = VALUES(category),
  rfid_capable = VALUES(rfid_capable), sort_order = VALUES(sort_order), config_schema = VALUES(config_schema);

-- ------------------------------------------------------------
-- 2. Salas / portas (antes só existiam como texto em access_devices.door_id)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS access_rooms (
  id VARCHAR(100) NOT NULL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO access_rooms (id, name)
  SELECT DISTINCT door_id, door_id FROM access_devices WHERE door_id IS NOT NULL AND door_id <> '';
INSERT IGNORE INTO access_rooms (id, name)
  SELECT DISTINCT door_id, door_id FROM access_permissions WHERE door_id IS NOT NULL AND door_id <> '';
UPDATE access_rooms SET name = 'Porta principal' WHERE id = 'main-door' AND name = id;

-- ------------------------------------------------------------
-- 3. Dispositivos: tipo, aprovação, leitores, configuração, credencial
--    Os dispositivos existentes ficam "approved" para nada deixar de funcionar.
-- ------------------------------------------------------------
ALTER TABLE access_devices
  ADD COLUMN IF NOT EXISTS device_type VARCHAR(40) NOT NULL DEFAULT 'esp32_rfid',
  ADD COLUMN IF NOT EXISTS description VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS readers VARCHAR(40) NULL,
  ADD COLUMN IF NOT EXISTS config LONGTEXT NULL,
  ADD COLUMN IF NOT EXISTS credential_hash CHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS credential_created_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Dispositivos criados no painel ainda não têm MAC nem sala definidos
ALTER TABLE access_devices
  MODIFY hardware_id VARCHAR(100) NULL,
  MODIFY door_id VARCHAR(100) NULL;

UPDATE access_devices SET readers = 'outside' WHERE readers IS NULL OR readers = '';

-- ------------------------------------------------------------
-- 4. Pedidos de registo: guardar sala, permissões, horário e estado inicial
-- ------------------------------------------------------------
ALTER TABLE access_registration_requests
  ADD COLUMN IF NOT EXISTS user_id INT NULL,
  ADD COLUMN IF NOT EXISTS door_id VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS can_enter TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS can_exit TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS user_active TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS time_from TIME NULL,
  ADD COLUMN IF NOT EXISTS time_to TIME NULL,
  ADD COLUMN IF NOT EXISTS card_id INT NULL,
  ADD COLUMN IF NOT EXISTS error_code VARCHAR(60) NULL;

-- Novos estados (duplicate, cancelled, expired, error) — VARCHAR em vez de ENUM
ALTER TABLE access_registration_requests
  MODIFY status VARCHAR(30) NOT NULL DEFAULT 'waiting_card';

-- ------------------------------------------------------------
-- 5. Permissões: janela horária diária (hora do escritório)
-- ------------------------------------------------------------
ALTER TABLE access_permissions
  ADD COLUMN IF NOT EXISTS time_from TIME NULL,
  ADD COLUMN IF NOT EXISTS time_to TIME NULL;

-- ------------------------------------------------------------
-- 6. Auditoria das ações administrativas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS access_admin_audit (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  session_ref CHAR(12) NULL,
  action VARCHAR(60) NOT NULL,
  target VARCHAR(120) NULL,
  details LONGTEXT NULL,
  ip VARCHAR(64) NULL,
  origin VARCHAR(190) NULL,
  KEY idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 7. Procedimento de registo de cartão (substitui a versão anterior;
--    a assinatura é a mesma, por isso o ESP32 não precisa de alterações)
--    - usa a sala, permissões, horário e estado escolhidos no painel
--    - associa a um utilizador existente quando user_id está preenchido
--    - marca o pedido como duplicate/expired/error para o painel ver o resultado
--    - parâmetros com colação explícita (= tabelas), para não depender da
--      colação por omissão da base de dados (erro "Illegal mix of collations")
-- ------------------------------------------------------------
DROP PROCEDURE IF EXISTS register_access_card;

DELIMITER $$
CREATE PROCEDURE register_access_card(
  IN p_registration_id VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  IN p_device_id VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  IN p_reader_id VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  IN p_uid VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
)
proc: BEGIN
  DECLARE v_status VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;
  DECLARE v_expired TINYINT DEFAULT 0;
  DECLARE v_name VARCHAR(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE v_contact VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE v_email VARCHAR(190) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE v_req_user INT DEFAULT NULL;
  DECLARE v_user_id INT DEFAULT NULL;
  DECLARE v_card_id INT DEFAULT NULL;
  DECLARE v_door_id VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;
  DECLARE v_can_enter TINYINT DEFAULT 1;
  DECLARE v_can_exit TINYINT DEFAULT 1;
  DECLARE v_user_active TINYINT DEFAULT 1;
  DECLARE v_from TIME DEFAULT NULL;
  DECLARE v_to TIME DEFAULT NULL;
  DECLARE v_owner VARCHAR(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL;
  DECLARE v_device_ok INT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    UPDATE access_registration_requests
       SET status = 'error', error_code = 'database_error'
     WHERE id = p_registration_id AND status = 'waiting_card';
    SELECT 0 AS success, 'database_error' AS error_code;
  END;

  SELECT status, (expires_at <= NOW()), name, contact, email, user_id, door_id,
         can_enter, can_exit, user_active, time_from, time_to
    INTO v_status, v_expired, v_name, v_contact, v_email, v_req_user, v_door_id,
         v_can_enter, v_can_exit, v_user_active, v_from, v_to
    FROM access_registration_requests
   WHERE id = p_registration_id AND device_id = p_device_id
   LIMIT 1;

  IF v_status IS NULL OR v_status <> 'waiting_card' THEN
    SELECT 0 AS success, 'registration_not_found_or_expired' AS error_code;
    LEAVE proc;
  END IF;

  IF v_expired = 1 THEN
    UPDATE access_registration_requests SET status = 'expired' WHERE id = p_registration_id;
    SELECT 0 AS success, 'registration_not_found_or_expired' AS error_code;
    LEAVE proc;
  END IF;

  IF EXISTS (SELECT 1 FROM access_cards WHERE uid = p_uid) THEN
    SELECT u.name INTO v_owner
      FROM access_cards c LEFT JOIN access_users u ON u.id = c.user_id
     WHERE c.uid = p_uid LIMIT 1;
    UPDATE access_registration_requests
       SET status = 'duplicate', uid = p_uid, error_code = 'card_already_registered'
     WHERE id = p_registration_id;
    SELECT 0 AS success, 'card_already_registered' AS error_code, v_owner AS owner_name;
    LEAVE proc;
  END IF;

  SELECT COUNT(*) INTO v_device_ok
    FROM access_devices
   WHERE device_id = p_device_id AND active = 1 AND approval_status = 'approved';

  IF v_device_ok = 0 THEN
    UPDATE access_registration_requests
       SET status = 'error', error_code = 'device_disabled'
     WHERE id = p_registration_id;
    SELECT 0 AS success, 'device_not_registered_or_disabled' AS error_code;
    LEAVE proc;
  END IF;

  IF v_door_id IS NULL THEN
    SELECT door_id INTO v_door_id FROM access_devices WHERE device_id = p_device_id LIMIT 1;
  END IF;

  IF v_door_id IS NULL THEN
    UPDATE access_registration_requests
       SET status = 'error', error_code = 'door_not_defined'
     WHERE id = p_registration_id;
    SELECT 0 AS success, 'door_not_defined' AS error_code;
    LEAVE proc;
  END IF;

  START TRANSACTION;

  IF v_req_user IS NOT NULL THEN
    SELECT id, name INTO v_user_id, v_name FROM access_users WHERE id = v_req_user LIMIT 1;
    IF v_user_id IS NULL THEN
      ROLLBACK;
      UPDATE access_registration_requests
         SET status = 'error', error_code = 'user_not_found'
       WHERE id = p_registration_id;
      SELECT 0 AS success, 'user_not_found' AS error_code;
      LEAVE proc;
    END IF;
  ELSE
    INSERT INTO access_users (name, contact, email, active)
    VALUES (v_name, v_contact, v_email, v_user_active);
    SET v_user_id = LAST_INSERT_ID();
  END IF;

  INSERT INTO access_cards (user_id, uid, active) VALUES (v_user_id, p_uid, 1);
  SET v_card_id = LAST_INSERT_ID();

  INSERT INTO access_permissions (card_id, door_id, can_enter, can_exit, time_from, time_to)
  VALUES (v_card_id, v_door_id, v_can_enter, v_can_exit, v_from, v_to);

  UPDATE access_registration_requests
     SET status = 'completed', uid = p_uid, completed_at = NOW(),
         user_id = v_user_id, card_id = v_card_id, error_code = NULL
   WHERE id = p_registration_id;

  COMMIT;

  SELECT 1 AS success, NULL AS error_code, v_user_id AS user_id, v_card_id AS card_id,
         p_uid AS uid, v_name AS name, v_door_id AS door_id;
END$$
DELIMITER ;
