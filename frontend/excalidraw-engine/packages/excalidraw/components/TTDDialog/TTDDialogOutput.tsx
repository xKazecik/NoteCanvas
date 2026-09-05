import Spinner from "../Spinner";

const ErrorComp = ({ error }: { error: string }) => {
  return (
    <div
      data-testid="ttd-dialog-output-error"
      className="ttd-dialog-output-error"
    >
      Error! <p>{error}</p>
    </div>
  );
};

interface TTDDialogOutputProps {
  error: Error | null;
  // notecanvas: React 18 types require a non-nullable RefObject here; upstream
  // AstraDraw builds against React 19 types, where this reads `HTMLDivElement | null`.
  canvasRef: React.RefObject<HTMLDivElement>;
  loaded: boolean;
}

export const TTDDialogOutput = ({
  error,
  canvasRef,
  loaded,
}: TTDDialogOutputProps) => {
  return (
    <div className="ttd-dialog-output-wrapper">
      {error && <ErrorComp error={error.message} />}
      {loaded ? (
        <div
          ref={canvasRef}
          style={{ opacity: error ? "0.15" : 1 }}
          className="ttd-dialog-output-canvas-container"
        />
      ) : (
        <Spinner size="2rem" />
      )}
    </div>
  );
};
