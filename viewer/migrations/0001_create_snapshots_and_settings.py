"""
创建 snapshots 和 settings 表
"""

from yoyo import step

__depends__ = {}

steps = [
    step(
        """
        CREATE TABLE snapshots (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            url VARCHAR(1024) NOT NULL COMMENT '监控目标URL',
            type VARCHAR(50) NOT NULL DEFAULT 'default' COMMENT '类型：product, video, post等',
            data JSON NOT NULL COMMENT '完整的提取数据',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '首次创建时间',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
            UNIQUE KEY uk_url_type (url(500), type),
            INDEX idx_created_at (created_at),
            INDEX idx_type (type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='监控数据快照表';
        """,
        """
        DROP TABLE IF EXISTS snapshots;
        """
    ),
    step(
        """
        CREATE TABLE settings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            `key` VARCHAR(100) NOT NULL UNIQUE COMMENT '配置键',
            value TEXT NOT NULL COMMENT '配置值',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统配置表';
        """,
        """
        DROP TABLE IF EXISTS settings;
        """
    )
]
