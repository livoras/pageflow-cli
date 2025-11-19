"""
添加 notified_at 字段到 snapshots 表
"""

from yoyo import step

__depends__ = {'0001_create_snapshots_and_settings'}

steps = [
    step(
        """
        ALTER TABLE snapshots
        ADD COLUMN notified_at TIMESTAMP NULL COMMENT '首次通知时间' AFTER updated_at;
        """,
        """
        ALTER TABLE snapshots DROP COLUMN notified_at;
        """
    )
]
