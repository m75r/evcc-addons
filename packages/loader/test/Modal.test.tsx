import { render, type ComponentChildren } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Modal } from "../src/manager/Modal.js";

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement("div");
  document.body.replaceChildren(root);
});

afterEach(() => render(null, root));

async function mount(headerActions?: ComponentChildren) {
  const onClose = vi.fn();
  await act(() => {
    render(
      <Modal
        title="Titel"
        titleId="t"
        testId="m"
        closeTestId="m-close"
        closeLabel="Schließen"
        onClose={onClose}
        headerActions={headerActions}
      >
        Inhalt
      </Modal>,
      root,
    );
  });
  return { onClose, header: root.querySelector(".modal-header") as HTMLElement };
}

describe("Modal", () => {
  it("lässt den Kopf ohne headerActions unverändert", async () => {
    const { header } = await mount();
    expect(header.innerHTML).toBe(
      '<h5 class="modal-title" id="t">Titel</h5>' +
        '<button type="button" class="btn-close" data-testid="m-close" aria-label="Schließen"></button>',
    );
  });

  it("stellt Aktionen vor ✕ in einen gemeinsamen Container", async () => {
    const { header, onClose } = await mount(<button data-testid="action">A</button>);
    const container = header.querySelector(":scope > div") as HTMLElement;
    expect(container.className).toBe("ms-auto d-flex align-items-center gap-2");
    const children = [...container.children];
    expect(children.map((el) => el.getAttribute("data-testid"))).toEqual(["action", "m-close"]);
    expect(children[1].className).toBe("btn-close m-0");
    await act(() => (children[1] as HTMLButtonElement).click());
    expect(onClose).toHaveBeenCalledOnce();
  });
});
