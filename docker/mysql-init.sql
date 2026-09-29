-- Se ejecuta solo la primera vez que se crea el volumen de MySQL.
CREATE DATABASE IF NOT EXISTS mesa_ayuda_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL PRIVILEGES ON mesa_ayuda_test.* TO 'mesa_app'@'%';
-- mysqldump necesita estos permisos para respaldos consistentes.
GRANT PROCESS, RELOAD ON *.* TO 'mesa_app'@'%';
FLUSH PRIVILEGES;
