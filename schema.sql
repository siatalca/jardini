CREATE DATABASE IF NOT EXISTS jardini CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE jardini;

CREATE TABLE IF NOT EXISTS plants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    image_path VARCHAR(255) NOT NULL DEFAULT 'img/logo/ICONO 2.png',
    price DECIMAL(10,2) NOT NULL,
    light_type VARCHAR(120) NOT NULL,
    watering VARCHAR(120) NOT NULL,
    location VARCHAR(20) NOT NULL,
    toxicity VARCHAR(120) DEFAULT 'No especificado',
    temperature_range VARCHAR(80) DEFAULT 'No especificado',
    humidity VARCHAR(80) DEFAULT 'No especificado',
    substrate VARCHAR(120) DEFAULT 'No especificado',
    fertilization VARCHAR(120) DEFAULT 'No especificado',
    pruning VARCHAR(120) DEFAULT 'No especificado',
    pests TEXT,
    pet_friendly TINYINT(1) NOT NULL DEFAULT 0,
    poisonous TINYINT(1) NOT NULL DEFAULT 0,
    specific_care TEXT,
    extra_factors TEXT,
    UNIQUE KEY uniq_plants_code (code),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_name VARCHAR(120) NULL,
    customer_email VARCHAR(120),
    customer_phone VARCHAR(40),
    notes TEXT,
    total DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sale_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sale_id INT NOT NULL,
    plant_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    care_token VARCHAR(120) NOT NULL UNIQUE,
    plant_snapshot LONGTEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sale_items_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
    CONSTRAINT fk_sale_items_plant FOREIGN KEY (plant_id) REFERENCES plants(id)
);
