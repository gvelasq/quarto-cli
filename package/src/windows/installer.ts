import { basename, join } from "path/mod.ts";
import { emptyDirSync, ensureDirSync, existsSync, moveSync } from "fs/mod.ts";

import { Configuration } from "../common/config.ts";
import { runCmd } from "../util/cmd.ts";
import { download, unzip } from "../util/utils.ts";


export async function makeInstallerWindows(configuration: Configuration) {

    const packageName = `quarto-${configuration.version}-win.msi`;

    // Wix information
    const wixFullVersion = "3112";
    const wixShortVersion = "311";

    // Working dir
    const workingDir = join(configuration.directoryInfo.out, "working_win");
    const wixDir = join(workingDir, "tools", `wix-${wixShortVersion}`);

    const heatCmd = join(wixDir, "heat");
    const candleCmd = join(wixDir, "candle");
    const lightCmd = join(wixDir, "light");

    // Download tools, if necessary
    if (!existsSync(workingDir) || !existsSync(wixDir) || !existsSync(heatCmd + ".exe")) {
        emptyDirSync(workingDir);
        ensureDirSync(wixDir);

        const fileName = `wix${wixShortVersion}-binaries.zip`;
        const wixToolsUrl = `https://github.com/wixtoolset/wix3/releases/download/wix${wixFullVersion}rtm/${fileName}`;

        const destZip = join(workingDir, fileName);

        // Download the wix tools
        configuration.log.info(`Downloading ${wixToolsUrl}`);
        configuration.log.info(`to ${destZip}`);
        await download(wixToolsUrl, destZip);

        // Uncompress the wix tools in the supporting directory
        configuration.log.info("Unzipping wix tools...")
        await unzip(destZip, wixDir, configuration.log);

        // Delete the downloaded zip file
        Deno.remove(destZip);
    }

    // TODO: Consider signing deno

    // heat the directory to generate a wix file for it 
    const heatOutput = join(workingDir, "quarto-frag.wxs");
    await runCmd(heatCmd, ["dir", configuration.directoryInfo.dist, "-var", "var.SourceDir", "-gg", "-sfrag", "-srd", "-cg", "ProductComponents", "-dr", "APPLICATIONFOLDER", "-out", heatOutput], configuration.log);

    // TODO: Process the version and other metadata into the WXS file
    // use candle to build the wixobj file
    const candleFiles = [join(configuration.directoryInfo.pkg, "src", "windows", "quarto.wxs"), heatOutput]
    const candleOutput: string[] = []
    await Promise.all(candleFiles.map(async candleInput => {
        const outputFileName = basename(candleInput, ".wxs");
        const outputPath = join(workingDir, outputFileName + ".wixobj");
        candleOutput.push(outputPath);
        return runCmd(candleCmd, [`-dSourceDir=${configuration.directoryInfo.dist}`, "-out", outputPath, candleInput], configuration.log);
    }));
    
    const licenseRtf = join(configuration.directoryInfo.pkg, "src", "windows", "license.rtf");
    const lightOutput = join(workingDir, packageName);
    const lightArgs = ["-out", lightOutput, ...candleOutput];
    lightArgs.push("-ext");
    lightArgs.push("WixUtilExtension");
    lightArgs.push("-ext");
    lightArgs.push("WixUIExtension");
    lightArgs.push(`-dWixUILicenseRtf=${licenseRtf}`);
    

    
    await runCmd(lightCmd, lightArgs, configuration.log);

    // Use signtool to sign the MSI

    configuration.log.info(`Moving ${lightOutput} to ${configuration.directoryInfo.out}`);
    moveSync(lightOutput, join(configuration.directoryInfo.out, basename(lightOutput)), { overwrite: true });

    // Clean up the working directory
    Deno.remove(workingDir, {recursive: true});
}