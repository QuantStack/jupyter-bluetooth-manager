import { Signal } from '@lumino/signaling';
import { Token } from '@lumino/coreutils';
import { IDeviceOptions } from './DeviceOptions';
import { IDisposable } from '@lumino/disposable';
import { Dialog, showDialog } from '@jupyterlab/apputils';
import { Widget } from '@lumino/widgets';

export function buildCompleteIdentifier(native: BluetoothDevice): string {
  const identifier = native.name?.replace(/\s+/g, '-') + '-' + native.id;
  return identifier;
}

/**
 * A class used to update the list of connected devices and the related signals used to rerender the connected devices section.
 */
export class BluetoothManager implements IBluetoothManager {
  constructor() {
    this.deviceListChanged = new Signal<this, Array<BluetoothManager.Device>>(
      this
    );
    this._deviceTypeRegistry = new BluetoothManager.DeviceTypeRegistry();
    this._deviceList = [];
    this._identifierRegistry = [];
  }

  get deviceList(): Array<BluetoothManager.Device> {
    return this._deviceList;
  }

  get deviceTypeRegistry(): BluetoothManager.DeviceTypeRegistry {
    return this._deviceTypeRegistry;
  }

  async connect(
    registryItem: IDeviceTypeRegistryItem
  ): Promise<BluetoothManager.Device | undefined> {
    const native = await this.requestDevice(registryItem);
    if (native) {
      const device = await registryItem.factory(native);
      if (device && device.isConnected) {
        this._addDeviceToList(device);
        device.disconnected.connect(async () => {
          this._removeDeviceFromList(device);
        });
        return device;
      }
    }
  }

  async disconnect(device: BluetoothManager.Device) {
    await device.disconnect();
    device.dispose();
  }

  // Method to add a device to the list
  private _addDeviceToList(device: BluetoothManager.Device): void {
    const identifier = buildCompleteIdentifier(device.native);
    if (this._identifierRegistry.includes(identifier) === false) {
      this._deviceList.push(device);
      this._identifierRegistry.push(identifier);
    } else {
      console.warn('The device is already in the registry of identifiers');
    }
    // Emit the signal when the list changes
    this.deviceListChanged.emit(this._deviceList);
  }

  // Method to remove a device from the list
  private _removeDeviceFromList(device: BluetoothManager.Device): void {
    const index = this._deviceList.indexOf(device);
    if (index > -1) {
      this._deviceList.splice(index, 1);
      this._identifierRegistry.splice(index, 1);
      // Emit the signal when the list changes
      this.deviceListChanged.emit(this._deviceList);
    }
    device.dispose();
  }

  removeAllDevices() {
    this._deviceList.forEach((device, index) => {
      this._removeDeviceFromList(device);
      this.deviceListChanged.emit(this._deviceList);
    });
  }

  async checkWebBluetoothSupport(): Promise<boolean> {
    const isWebBluetoothSupported: boolean = navigator.bluetooth ? true : false;
    if (isWebBluetoothSupported === false) {
      showDialog({
        title: 'Error',
        body: 'Web Bluetooth is not supported on your browser. It works on Chrome and Edge (Firefox and Explorer are not supported). \n Please also check that the Web Bluetooth flag is properly set to enabled in the Chrome flags (chrome://flags/).',
        buttons: [Dialog.okButton({ label: 'Close' })]
      });
    }
    return isWebBluetoothSupported;
  }

  async requestDevice(
    registryItem: IDeviceTypeRegistryItem
  ): Promise<BluetoothDevice | undefined> {
    const isWebBluetoothSupported = await this.checkWebBluetoothSupport();
    if (isWebBluetoothSupported) {
      const native = await navigator.bluetooth.requestDevice(
        registryItem.options
      );
      return native;
    } else {
      return;
    }
  }

  private _deviceList: Array<BluetoothManager.Device>;
  public deviceListChanged: Signal<this, Array<BluetoothManager.Device>>;
  private _deviceTypeRegistry: BluetoothManager.DeviceTypeRegistry;
  private _identifierRegistry: Array<string>;
}

export namespace BluetoothManager {
  /* A class for device using the native bluetoothDevice from the web bluetooth API*/
  export class Device implements IDisposable {
    public isConnected: boolean | undefined;
    public native: BluetoothDevice;
    public connected: Signal<this, boolean>;
    public disconnected: Signal<this, boolean>;
    public isDisposed: boolean;
    public contextCommands: Array<string>;

    constructor(native: BluetoothDevice) {
      this.connected = new Signal<this, boolean>(this);
      this.disconnected = new Signal<this, boolean>(this);
      this.isConnected = false;
      this.isDisposed = false;
      this.native = native;
      this.contextCommands = ['bluetooth-manager:disconnect-device'];
    }

    async connectAndGetAllServices(): Promise<
      Array<BluetoothRemoteGATTService> | undefined
    > {
      this.native.addEventListener('gattserverdisconnected', event => {
        this.isConnected = false;
        this.disconnected.emit(true);
      });
      const server = this.native.gatt;
      if (server) {
        const timeout = 5000;
        const connectWithTimeout = new Promise<void>((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('Connection to GATT server timed out'));
            server.disconnect();
            this.dispose();
          }, timeout);

          server
            .connect()
            .then(async () => {
              clearTimeout(timeoutId);
              resolve();
              this.isConnected = true;
              this.connected.emit(true);
            })
            .catch(error => {
              server.disconnect();
              reject(error);
            });
        });
        await connectWithTimeout;
        if (server.connected === true) {
          const services = await server.getPrimaryServices();
          if (!services || services.length === 0) {
            throw new Error(
              'Server exists but no service found on the device.'
            );
          } else {
            return services;
          }
        } else {
          throw new Error(
            'There is no connection to server. No attempt to get a service.'
          );
        }
      } else {
        throw new Error('Server is not defined.');
      }
    }

    async disconnect(): Promise<void> {
      if (this.native) {
        this.native.gatt?.disconnect();
        this.isConnected = false;
      }
    }

    async getService(
      selectedServiceUUID: string
    ): Promise<BluetoothRemoteGATTService | undefined> {
      const services = await this.connectAndGetAllServices();
      if (services) {
        const selectedService = services.find(
          service => service.uuid === selectedServiceUUID
        );
        return selectedService;
      } else {
        throw new Error('Services could not be reached.');
      }
    }

    async getAllCharacteristics(
      serviceUUID: string
    ): Promise<Array<BluetoothRemoteGATTCharacteristic> | undefined> {
      const service = await this.getService(serviceUUID);
      if (service) {
        return service.getCharacteristics();
      } else {
        throw new Error('The requested service is not available.');
      }
    }

    async getCharacteristic(
      serviceUUID: string,
      characteristicUUID: string
    ): Promise<BluetoothRemoteGATTCharacteristic | undefined> {
      const service = await this.getService(serviceUUID);
      if (service) {
        return service.getCharacteristic(characteristicUUID);
      } else {
        throw new Error('The requested service is not available.');
      }
    }

    dispose(): void {
      if (this.isDisposed) {
        return;
      }
      this.isDisposed = true;
      Signal.clearData(this);
    }
  }

  export class DeviceTypeRegistry implements IDeviceTypeRegistry {
    constructor() {
      this._deviceTypes = [];
      this._added = new Signal<this, IDeviceTypeRegistryItem>(this);
    }

    add(registryItem: IDeviceTypeRegistryItem) {
      this._deviceTypes.push(registryItem);
      this._added.emit(registryItem);
    }

    get deviceTypes(): IDeviceTypeRegistryItem[] {
      return this._deviceTypes;
    }

    get added(): Signal<this, IDeviceTypeRegistryItem> {
      return this._added;
    }

    private _deviceTypes: Array<IDeviceTypeRegistryItem>;
    private _added: Signal<this, IDeviceTypeRegistryItem>;
  }
}

/**
 * Interface for the bluetooth manager.
 */
export interface IBluetoothManager {
  removeAllDevices(Devices: Array<BluetoothManager.Device>): void;
  connect(registryItem: IDeviceTypeRegistryItem): any;
  disconnect(device: BluetoothManager.Device): void;
  deviceListChanged: Signal<BluetoothManager, Array<BluetoothManager.Device>>;
  get deviceList(): Array<BluetoothManager.Device>;
  get deviceTypeRegistry(): BluetoothManager.DeviceTypeRegistry;
}

export interface IDeviceTypeRegistryItem {
  deviceType: string;
  pairingInformationWidget: Widget;

  factory: (
    native: BluetoothDevice
  ) => Promise<BluetoothManager.Device | undefined>;
  options: IDeviceOptions;
}

export interface IDeviceTypeRegistry {
  add: (registryItem: IDeviceTypeRegistryItem) => void;
  get deviceTypes(): IDeviceTypeRegistryItem[];
}

export const IBluetoothManager = new Token<IBluetoothManager>(
  '@jupyterlab/bluetooth:manager'
);
