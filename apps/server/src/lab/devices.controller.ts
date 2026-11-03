import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { z } from 'zod';
import {
  listDevicesQuerySchema,
  registerDeviceRequestSchema,
  updateDeviceRequestSchema,
} from '@lingualab/shared';
import type {
  DeviceMeResponse,
  DeviceView,
  Items,
  ListDevicesQuery,
  RegisterDeviceRequest,
  RegisterDeviceResponse,
  UpdateDeviceRequest,
} from '@lingualab/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ClientIp } from '../common/client-ip.decorator.js';
import { DEVICE_KEY_HEADER } from '../auth/device-key.service.js';
import { Public, Roles } from '../auth/roles.decorator.js';
import { DevicesService } from './devices.service.js';

const idPipe = new ZodValidationPipe(z.uuid());

/** The one thing used of Express's response: setting the status. */
interface StatusSetter {
  status(code: number): unknown;
}

/**
 * Lab PCs (docs/docs/04-api-and-events.md, Lab, devices and sessions).
 * Registering is open, since a new PC has no account and no key yet; it gets
 * nothing a waiting PC could use. Everything else is the admin's.
 */
@Controller('devices')
@Roles('admin')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  /** 201 with a new key, or 200 for a check-in with the key the PC already has. */
  @Post('register')
  @Public()
  async register(
    @Body(new ZodValidationPipe(registerDeviceRequestSchema)) body: RegisterDeviceRequest,
    @Headers(DEVICE_KEY_HEADER) deviceKey: string | undefined,
    @ClientIp() ip: string,
    @Res({ passthrough: true }) res: StatusSetter,
  ): Promise<RegisterDeviceResponse> {
    const { created, answer } = await this.devices.register(body, deviceKey, ip);
    res.status(created ? 201 : 200);
    return answer;
  }

  /** Which PC and seat this is, for the login screen (S-01). Only an approved PC is answered. */
  @Get('me')
  @Public()
  async me(@Headers(DEVICE_KEY_HEADER) deviceKey: string | undefined): Promise<DeviceMeResponse> {
    return this.devices.whoAmI(deviceKey);
  }

  @Get()
  async list(
    @Query(new ZodValidationPipe(listDevicesQuerySchema)) query: ListDevicesQuery,
  ): Promise<Items<DeviceView>> {
    return this.devices.list(query);
  }

  @Patch(':id')
  async update(
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(updateDeviceRequestSchema)) body: UpdateDeviceRequest,
  ): Promise<DeviceView> {
    return this.devices.update(id, body);
  }
}
