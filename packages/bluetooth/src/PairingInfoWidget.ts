import { Widget } from '@lumino/widgets';

export interface IPairingInformation {
  instructions: string | undefined;
  SVGUrl: string | undefined;
  imageAlt: string | undefined;
  imageWidth: string | undefined;
}

export class PairingInfoWidget extends Widget {
  constructor(pairingInformation: IPairingInformation) {
    super();
    const text = document.createElement('p');
    text.textContent =
      pairingInformation.instructions ?? 'Select a device in the list.';
    text.style.fontSize = '14px';

    this.node.appendChild(text);

    if (pairingInformation.SVGUrl) {
      const imageContainer = document.createElement('div');
      imageContainer.style.textAlign = 'center';

      const img = document.createElement('img');
      img.src = pairingInformation.SVGUrl;
      if (pairingInformation.imageAlt) {
        img.alt = pairingInformation.imageAlt;
      }
      if (pairingInformation.imageWidth) {
        img.style.width = pairingInformation.imageWidth;
      }

      imageContainer.appendChild(img);
      this.node.appendChild(imageContainer);
    }
  }
}
