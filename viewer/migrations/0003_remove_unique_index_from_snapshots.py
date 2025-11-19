"""
删除 snapshots 表的唯一索引，允许保留历史记录
"""

from yoyo import step

__depends__ = {'0002_add_notified_at_to_snapshots'}

steps = [
    step(
        """
        ALTER TABLE snapshots DROP INDEX uk_url_type;
        """,
        """
        ALTER TABLE snapshots ADD UNIQUE KEY uk_url_type (url(500), type);
        """
    ),
    step(
        """
        ALTER TABLE snapshots ADD INDEX idx_url_type (url(500), type);
        """,
        """
        ALTER TABLE snapshots DROP INDEX idx_url_type;
        """
    )
]
