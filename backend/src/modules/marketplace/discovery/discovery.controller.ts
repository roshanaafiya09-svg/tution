import { Controller, Get, Param, Query } from '@nestjs/common';
import { DiscoveryService } from './discovery.service';
import { SearchTutorsDto } from './dto/search-tutors.dto';

@Controller('marketplace/discovery')
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get('tutors')
  searchTutors(@Query() query: SearchTutorsDto) {
    return this.discoveryService.searchTutors(query);
  }

  @Get('tutors/:slug')
  getPublicTutorPage(@Param('slug') slug: string) {
    return this.discoveryService.getPublicTutorPage(slug);
  }

  @Get('gate-status')
  async getGateStatus() {
    return { gateOpen: await this.discoveryService.isGateOpen() };
  }
}
