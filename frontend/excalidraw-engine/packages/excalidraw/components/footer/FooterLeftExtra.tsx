import clsx from "clsx";

import { useTunnels } from "../../context/tunnels";
import { useUIAppState } from "../../context/ui-appState";

const FooterLeftExtra = ({ children }: { children?: React.ReactNode }) => {
  const { FooterLeftExtraTunnel } = useTunnels();
  const appState = useUIAppState();
  return (
    <FooterLeftExtraTunnel.In>
      <div
        className={clsx("footer-left-extra zen-mode-transition", {
          "layer-ui__wrapper__footer-left--transition-bottom":
            appState.zenModeEnabled,
        })}
      >
        {children}
      </div>
    </FooterLeftExtraTunnel.In>
  );
};

export default FooterLeftExtra;
FooterLeftExtra.displayName = "FooterLeftExtra";
