import { App, Modal } from "obsidian";

export class ReportModal extends Modal {
  constructor(
    app: App,
    private readonly title: string,
    private readonly lines: string[]
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: this.title });

    const list = contentEl.createEl("ul");
    for (const line of this.lines) {
      list.createEl("li", { text: line });
    }

    const button = contentEl.createEl("button", { text: "Close" });
    button.addEventListener("click", () => this.close());
  }
}
