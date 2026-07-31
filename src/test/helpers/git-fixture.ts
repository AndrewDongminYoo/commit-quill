import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export class GitFixture {
  readonly repositoryPath: string;

  private constructor(repositoryPath: string) {
    this.repositoryPath = repositoryPath;
  }

  static async create(): Promise<GitFixture> {
    const repositoryPath = await mkdtemp(join(tmpdir(), "commit-quill-test-"));
    const fixture = new GitFixture(repositoryPath);
    await fixture.git(["init"]);
    await fixture.git(["config", "user.email", "test@example.com"]);
    await fixture.git(["config", "user.name", "Commit Quill Test"]);
    await fixture.write("README.md", "before\n");
    await fixture.git(["add", "README.md"]);
    await fixture.git(["commit", "-m", "chore: initialize fixture"]);
    return fixture;
  }

  async write(path: string, content: string): Promise<void> {
    await writeFile(join(this.repositoryPath, path), content, "utf8");
  }

  async writeIn(
    directory: string,
    name: string,
    content: string,
  ): Promise<void> {
    await mkdir(join(this.repositoryPath, directory), { recursive: true });
    await this.write(join(directory, name), content);
  }

  async writeBytes(path: string, content: Buffer): Promise<void> {
    await writeFile(join(this.repositoryPath, path), content);
  }

  async stage(path: string): Promise<void> {
    await this.git(["add", "--", path]);
  }

  async dispose(): Promise<void> {
    await rm(this.repositoryPath, { recursive: true, force: true });
  }

  async output(args: readonly string[]): Promise<string> {
    const result = await execFile("git", args, {
      cwd: this.repositoryPath,
      encoding: "utf8",
    });
    return result.stdout;
  }

  private async git(args: readonly string[]): Promise<void> {
    await this.output(args);
  }
}
