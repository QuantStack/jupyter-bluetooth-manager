import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ITranslator } from '@jupyterlab/translation';
import { IRunningSessions, IRunningSessionManagers } from '@jupyterlab/running';
import { addIcon, CommandToolbarButton } from '@jupyterlab/ui-components';
import { Dialog, showDialog } from '@jupyterlab/apputils';
import {
  BluetoothDeviceRunningItem,
  BluetoothManager,
  DropDownRegistry,
  IBluetoothManager
} from '@jupyter-bluetooth-manager/bluetooth';

import { Widget } from '@lumino/widgets';


export namespace CommandIDs {
  export const openDeviceRegistryDialog =
    'bluetooth-manager:open-dialog-for-devices-registry';
  export const disconnect = 'bluetooth-manager:disconnect-device';
}

const BluetoothManagerPlugin: JupyterFrontEndPlugin<IBluetoothManager> = {
  id: 'bluetooh-manager:bluetooth-manager-plugin',
  description: 'Provides the bluetooth manager',
  provides: IBluetoothManager,
  autoStart: true,
  activate: (app: JupyterFrontEnd): IBluetoothManager => {
    console.log('JupyterLab bluetooth-manager-plugin is activated!');
    const bluetoothManager = new BluetoothManager();
    bluetoothManager.deviceListChanged.connect(
      async (sender, deviceList: Array<BluetoothManager.Device>) => {
        console.warn(
          'The list of devices has been updated and is now: ',
          deviceList
        );
      }
    );
    return bluetoothManager;
  }
};

const BluetoothSidebarPlugin: JupyterFrontEndPlugin<void> = {
  id: 'bluetooh-manager:bluetooth-sidebar-plugin',
  description:
    'Provides the connected bluetooth devices dialog to populate the sidebar.',
  requires: [IRunningSessionManagers, ITranslator, IBluetoothManager],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    managers: IRunningSessionManagers,
    translator: ITranslator,
    bluetoothManager: IBluetoothManager
  ): void => {
    console.log('JupyterLab bluetooth-sidebar plugin is activated!');
    const trans = translator.load('jupyterlab');
    const { commands } = app;
    const openDeviceRegistryDialogLabel = trans.__('Add a Device');
    let runningItemsList: Array<IRunningSessions.IRunningItem>;

    app.commands.addCommand(CommandIDs.disconnect, {
      execute: args => {
        const selectedDevice = bluetoothManager.deviceList.find(
          device => device.native.id === (args.deviceID as string)
        );
        if (selectedDevice) {
          bluetoothManager.disconnect(selectedDevice);
          return selectedDevice;
        } else {
          throw new Error('No device provided or device is invalid');
        }
      },
      caption: trans.__('Disconnect device'),
      label: trans.__('Disconnect Device')
    });

    app.commands.addCommand(CommandIDs.openDeviceRegistryDialog, {
      execute: async () => {
        showDialog({
          title: 'Select device type',
          body: new DropDownRegistry(bluetoothManager.deviceTypeRegistry),
          buttons: [
            Dialog.okButton({ label: 'Select' }),
            Dialog.cancelButton({ label: 'Cancel' })
          ]
        }).then(async result => {
          if (result.button.accept) {

            bluetoothManager.deviceTypeRegistry.deviceTypes.forEach(
              async item => {
                if (item.deviceType === result.value) {
                  console.log('Just before calling connect method')

                  const body = new Widget();
                  if (item.withImage) {
                    const img = document.createElement('img');
                    img.src = item.SVGUrl;
                    img.alt = item.imageAlt;
                    body.node.appendChild(img);
                  }
                  const dialog = new Dialog({
                    title: item.instructions,
                    body: body,
                    buttons: [
                      Dialog.okButton({ label: 'Close' }),
                    ]
                  })

                  try {
                    dialog.launch();
                    await bluetoothManager.connect(item);
                  }
                  catch (error) {
                    console.log("Something went wrong:", error);

                  } finally {
                    dialog.dispose();
                  }

                } else {
                  console.warn(
                    'There is no corresponding item in the registry!'
                  );
                }
              }
            );
          }
        });
      }
    });

    managers.add({
      name: trans.__('Bluetooth Devices'),
      supportsMultipleViews: false,
      running: () => {
        runningItemsList = [];
        bluetoothManager.deviceList.forEach(device => {
          runningItemsList.push(
            new BluetoothDeviceRunningItem(
              device,
              bluetoothManager as BluetoothManager,
              commands
            )
          );
        });
        return runningItemsList;
      },
      shutdownAll: () => {
        bluetoothManager.removeAllDevices(bluetoothManager.deviceList);
      },
      refreshRunning: () => {
        return void 0;
      },
      runningChanged: bluetoothManager.deviceListChanged,
      shutdownLabel: trans.__('Disconnect'),
      shutdownAllLabel: trans.__('Disconnect All'),
      shutdownAllConfirmationText: trans.__(
        'Are you sure you want to disconnect all devices?'
      ),
      toolbarButtons: [
        new CommandToolbarButton({
          commands,
          id: CommandIDs.openDeviceRegistryDialog,
          icon: addIcon,
          caption: openDeviceRegistryDialogLabel,
          args: { toolbar: false }
        })
      ]
    });
  }
};

const BluetoothExtensionPlugins: JupyterFrontEndPlugin<any>[] = [
  BluetoothManagerPlugin,
  BluetoothSidebarPlugin
];
export default BluetoothExtensionPlugins;
