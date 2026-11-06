import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { z } from 'zod';
import {
  deviceExitRequestSchema,
  listDevicesQuerySchema,
  registerDeviceRequestSchema,
  updateDeviceRequestSchema,
} from '@lingualab/shared';
import type {
  DeviceExitRequest,
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
import { DeviceExitService } from './device-exit.service.js';

const idPipe = new ZodValidationPipe(z.uuid());

/** The one thing used of Express's response: setting the status. */
interface StatusSetter {
  status(code: number): unknown;
}

/**
 * Lab PCs (docs/docs/04-api-and-events.md, Lab, devices and sessions).
 * Registering is open, since a new PC has no account and no key yet; it gets
 * nothing a waiting PC could use. Asking where it is and asking to close the
 * student app go by the PC's key. Everything else is the admin's.
 */
@Controller('devices')
@Roles('admin')
export class DevicesController {
  constructor(
    private readonly devices: DevicesService,
    private readonly exits: DeviceExitService,
  ) {}

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

  /**
   * The student app asks to close (STU-06): 204 when the admin PIN is right.
   * By the device key, with no login, since a student may be logged in.
   */
  @Post('exit')
  @Public()
  @HttpCode(204)
  async exit(
    @Body(new ZodValidationPipe(deviceExitRequestSchema)) body: DeviceExitRequest,
    @Headers(DEVICE_KEY_HEADER) deviceKey: string | undefined,
    @ClientIp() ip: string,
  ): Promise<void> {
    await this.exits.exit(deviceKey, body.pin, ip);
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
