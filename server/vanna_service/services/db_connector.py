"""
SQLite 数据库连接器
负责创建和管理业务数据库表
"""
import sqlite3
import logging
from typing import Optional
from config import SQLITE_DB_PATH

logger = logging.getLogger(__name__)


class DBConnector:
    """SQLite 数据库连接器"""

    def __init__(self, db_path: str = None):
        self.db_path = db_path or SQLITE_DB_PATH
        logger.info(f"DBConnector initialized with db_path={self.db_path}")

    def get_connection(self) -> sqlite3.Connection:
        """获取数据库连接"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def init_db(self):
        """初始化数据库表结构"""
        conn = self.get_connection()
        cursor = conn.cursor()
        try:
            # 设备表
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS devices (
                    id TEXT PRIMARY KEY,
                    device_code TEXT NOT NULL,
                    product_name TEXT,
                    manufacturer_code TEXT,
                    manufacturer_name TEXT,
                    device_type_code TEXT,
                    device_type_name TEXT,
                    node_type TEXT,
                    auth_method TEXT,
                    username TEXT,
                    password TEXT,
                    protocol TEXT,
                    serial_number TEXT,
                    location TEXT,
                    longitude REAL,
                    latitude REAL,
                    junction_id TEXT,
                    junction_type TEXT,
                    junction_level TEXT,
                    region TEXT,
                    related_junction TEXT,
                    ip_address TEXT,
                    purpose TEXT,
                    owner_unit TEXT,
                    maintenance_unit TEXT,
                    status TEXT,
                    install_location TEXT,
                    junction_code TEXT,
                    traffic_police_code TEXT,
                    enabled TEXT,
                    snapshot_date TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # 快照记录表
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT NOT NULL UNIQUE,
                    source_file TEXT,
                    imported_at TEXT,
                    total_count INTEGER DEFAULT 0,
                    enabled_count INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # 延迟报告表
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS latency_reports (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    device_code TEXT NOT NULL,
                    device_name TEXT,
                    region TEXT,
                    report_date TEXT NOT NULL,
                    avg_latency_ms REAL,
                    max_latency_ms REAL,
                    min_latency_ms REAL,
                    packet_loss_rate REAL,
                    total_checks INTEGER DEFAULT 0,
                    online_count INTEGER DEFAULT 0,
                    offline_count INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # 创建索引以提升查询性能
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_devices_snapshot_date
                ON devices(snapshot_date)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_devices_region
                ON devices(region)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_devices_manufacturer
                ON devices(manufacturer_name)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_devices_device_type
                ON devices(device_type_code)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_devices_status
                ON devices(status)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_latency_reports_date
                ON latency_reports(report_date)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_latency_reports_device
                ON latency_reports(device_code)
            """)

            conn.commit()
            logger.info("Database tables and indexes created successfully")
        except Exception as e:
            conn.rollback()
            logger.error(f"Failed to initialize database: {e}")
            raise
        finally:
            conn.close()

    def insert_devices(self, devices: list[dict], snapshot_date: str) -> int:
        """
        批量插入设备数据
        :return: 插入的行数
        """
        if not devices:
            return 0

        conn = self.get_connection()
        cursor = conn.cursor()
        try:
            cursor.executemany("""
                INSERT OR REPLACE INTO devices (
                    id, device_code, product_name, manufacturer_code, manufacturer_name,
                    device_type_code, device_type_name, node_type, auth_method,
                    username, password, protocol, serial_number, location,
                    longitude, latitude, junction_id, junction_type, junction_level,
                    region, related_junction, ip_address, purpose, owner_unit,
                    maintenance_unit, status, install_location, junction_code,
                    traffic_police_code, enabled, snapshot_date
                ) VALUES (
                    :id, :deviceCode, :productName, :manufacturerCode, :manufacturerName,
                    :deviceTypeCode, :deviceTypeName, :nodeType, :authMethod,
                    :username, :password, :protocol, :serialNumber, :location,
                    :longitude, :latitude, :junctionId, :junctionType, :junctionLevel,
                    :region, :relatedJunction, :ipAddress, :purpose, :ownerUnit,
                    :maintenanceUnit, :status, :installLocation, :junctionCode,
                    :trafficPoliceCode, :enabled, :snapshot_date
                )
            """, [{**d, "snapshot_date": snapshot_date} for d in devices])
            conn.commit()
            count = cursor.rowcount
            logger.info(f"Inserted {count} devices for date {snapshot_date}")
            return count
        except Exception as e:
            conn.rollback()
            logger.error(f"Failed to insert devices: {e}")
            raise
        finally:
            conn.close()

    def insert_snapshots(self, snapshots: list[dict]) -> int:
        """批量插入快照记录"""
        if not snapshots:
            return 0

        conn = self.get_connection()
        cursor = conn.cursor()
        try:
            cursor.executemany("""
                INSERT OR REPLACE INTO snapshots (date, source_file, imported_at, total_count, enabled_count)
                VALUES (:date, :sourceFile, :importedAt, :totalCount, :enabledCount)
            """, snapshots)
            conn.commit()
            logger.info(f"Inserted {len(snapshots)} snapshots")
            return len(snapshots)
        except Exception as e:
            conn.rollback()
            logger.error(f"Failed to insert snapshots: {e}")
            raise
        finally:
            conn.close()

    def insert_latency_reports(self, reports: list[dict]) -> int:
        """批量插入延迟报告"""
        if not reports:
            return 0

        conn = self.get_connection()
        cursor = conn.cursor()
        try:
            cursor.executemany("""
                INSERT INTO latency_reports (
                    device_code, device_name, region, report_date,
                    avg_latency_ms, max_latency_ms, min_latency_ms,
                    packet_loss_rate, total_checks, online_count, offline_count
                ) VALUES (
                    :device_code, :device_name, :region, :report_date,
                    :avg_latency_ms, :max_latency_ms, :min_latency_ms,
                    :packet_loss_rate, :total_checks, :online_count, :offline_count
                )
            """, reports)
            conn.commit()
            logger.info(f"Inserted {len(reports)} latency reports")
            return len(reports)
        except Exception as e:
            conn.rollback()
            logger.error(f"Failed to insert latency reports: {e}")
            raise
        finally:
            conn.close()

    def get_table_names(self) -> list[str]:
        """获取所有表名"""
        conn = self.get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            )
            return [row[0] for row in cursor.fetchall()]
        finally:
            conn.close()

    def get_table_schema(self, table_name: str) -> str:
        """获取表的 DDL 语句"""
        conn = self.get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
                (table_name,)
            )
            row = cursor.fetchone()
            return row[0] if row else ""
        finally:
            conn.close()

    def get_row_count(self, table_name: str) -> int:
        """获取表的行数"""
        conn = self.get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            return cursor.fetchone()[0]
        finally:
            conn.close()
