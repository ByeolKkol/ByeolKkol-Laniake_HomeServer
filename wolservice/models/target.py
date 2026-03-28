from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

OsType = Literal["windows", "linux", "synology"]


class WolTarget(BaseModel):
    id: str
    name: str
    mac: str = Field(..., pattern=r'^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$')
    ip: str | None = None
    ssh_port: int = 22
    ssh_user: str | None = None
    ssh_password: str | None = None
    os_type: OsType = "linux"


class WolTargetCreate(BaseModel):
    name: str
    mac: str = Field(..., pattern=r'^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$')
    ip: str | None = None
    ssh_port: int = 22
    ssh_user: str | None = None
    ssh_password: str | None = None
    os_type: OsType = "linux"


class WolTargetUpdate(BaseModel):
    name: str | None = None
    mac: str | None = Field(None, pattern=r'^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$')
    ip: str | None = None
    ssh_port: int | None = None
    ssh_user: str | None = None
    ssh_password: str | None = None
    os_type: OsType | None = None


class PowerStatus(BaseModel):
    id: str
    online: bool | None
