DELIMITER $$
CREATE PROCEDURE register_access_card(
    IN p_registration_id VARCHAR(80),
    IN p_device_id VARCHAR(80),
    IN p_reader_id VARCHAR(80),
    IN p_uid VARCHAR(50)
)
BEGIN
    DECLARE v_count INT DEFAULT 0;
    DECLARE v_name VARCHAR(150);
    DECLARE v_contact VARCHAR(100);
    DECLARE v_email VARCHAR(190);
    DECLARE v_user_id INT UNSIGNED;
    DECLARE v_card_id INT UNSIGNED;
    DECLARE v_door_id VARCHAR(80);

    SELECT COUNT(*)
    INTO v_count
    FROM access_registration_requests
    WHERE id = p_registration_id
      AND device_id = p_device_id
      AND status = 'waiting_card'
      AND expires_at > NOW();

    IF v_count = 0 THEN
        SELECT 0 AS success,
               'registration_not_found_or_expired' AS error_code;
    ELSE
        SELECT COUNT(*)
        INTO v_count
        FROM access_cards
        WHERE uid = p_uid;

        IF v_count > 0 THEN
            SELECT 0 AS success,
                   'card_already_registered' AS error_code;
        ELSE
            SELECT name, contact, email
            INTO v_name, v_contact, v_email
            FROM access_registration_requests
            WHERE id = p_registration_id
            LIMIT 1;

            SELECT door_id
            INTO v_door_id
            FROM access_devices
            WHERE device_id = p_device_id
              AND active = 1
            LIMIT 1;

            IF v_door_id IS NULL THEN
                SELECT 0 AS success,
                       'device_not_registered_or_disabled' AS error_code;
            ELSE
                START TRANSACTION;

                INSERT INTO access_users
                    (name, contact, email, active)
                VALUES
                    (v_name, v_contact, v_email, 1);

                SET v_user_id = LAST_INSERT_ID();

                INSERT INTO access_cards
                    (user_id, uid, active)
                VALUES
                    (v_user_id, p_uid, 1);

                SET v_card_id = LAST_INSERT_ID();

                INSERT INTO access_permissions
                    (card_id, door_id, can_enter, can_exit)
                VALUES
                    (v_card_id, v_door_id, 1, 1);

                UPDATE access_registration_requests
                SET status = 'completed',
                    uid = p_uid,
                    completed_at = NOW()
                WHERE id = p_registration_id;

                COMMIT;

                SELECT
                    1 AS success,
                    NULL AS error_code,
                    v_user_id AS user_id,
                    v_card_id AS card_id,
                    p_uid AS uid,
                    v_name AS name,
                    v_door_id AS door_id;
            END IF;
        END IF;
    END IF;
END$$
DELIMITER ;
